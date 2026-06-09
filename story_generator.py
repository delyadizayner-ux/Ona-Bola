import os
import json
import time
import openai

# Substrings that mark a transient provider error worth retrying
_TRANSIENT_MARKERS = ("503", "429", "500", "502", "504", "UNAVAILABLE",
                      "overloaded", "high demand", "rate limit", "ratelimit", "timeout")

# ---------------------------------------------------------------------------
# Bad-habit knowledge base
# Each habit has: a short label, WHY it is harmful, and a small daily task.
# Used both for building the AI prompt and for the offline fallback story.
# ---------------------------------------------------------------------------
HABIT_INFO = {
    "screentime": {
        "label": "ko'p telefon/planshet ko'rish",
        "why": "ko'zlarni charchatadi va haqiqiy do'stlar, o'yinlardan uzoqlashtiradi",
        "task": "Bugun telefonni bir chetga qo'yib, 30 daqiqa o'yinchoq yoki kitob bilan o'ynash",
    },
    "tantrum": {
        "label": "do'konda 'narsa olib ber' deb janjal/harhasha qilish",
        "why": "janjal bilan emas, chiroyli so'rab gapirish bilan natijaga erishish go'zalroq",
        "task": "Bugun biror narsa so'raganda baqirmasdan, muloyim 'iltimos' deb so'rash",
    },
    "kindergarten": {
        "label": "bog'chaga borishni xohlamaslik",
        "why": "bog'chada yangi do'stlar, o'yinlar va qiziqarli bilimlar kutib turibdi",
        "task": "Ertaga bog'chaga quvnoq kayfiyatda borish va bitta yangi do'st orttirish",
    },
    "homework": {
        "label": "dars/mashq qilishni xohlamaslik",
        "why": "har kuni ozgina o'rganish bolani aqlli va kuchli qahramonga aylantiradi",
        "task": "Bugun 15 daqiqa diqqat bilan dars yoki mashq qilish",
    },
    "moody": {
        "label": "injiq, qaysar bo'lib qolish",
        "why": "shirinso'zlik va tabassum atrofdagilarni xursand qiladi va do'st orttiradi",
        "task": "Bugun uydagilarga bir marta yordam berish va tabassum qilish",
    },
    "teeth_brush": {
        "label": "tish yuvishni yoqtirmaslik",
        "why": "toza tishlar mikroblardan himoya qiladi va tabassumni go'zal qiladi",
        "task": "Bugun kechqurun tishlarni 2 daqiqa yaxshilab yuvish",
    },
    "food": {
        "label": "faqat shirinlik/fast-food yeb, foydali taomni rad etish",
        "why": "meva va sabzavotlar tanaga kuch-quvvat va tezlik beradi",
        "task": "Bugun onangiz tayyorlagan foydali taomni oxirigacha yeyish",
    },
    "bedtime": {
        "label": "kech uxlash, vaqtida uxlamaslik",
        "why": "vaqtida uxlash tanani dam oldiradi va yangi kunga kuch beradi",
        "task": "Bugun soat 21:00 da ekranlarni o'chirib, uxlashga yotish",
    },
    "behavior": {
        "label": "ota-ona so'ziga quloq solmaslik",
        "why": "ota-onaning maslahati doim bolaning foydasi uchun aytiladi",
        "task": "Bugun ota-onaning bir iltimosini darrov, xursandchilik bilan bajarish",
    },
    "lying": {
        "label": "yolg'on gapirish",
        "why": "rostgo'ylik ishonch va hurmat keltiradi, yolg'on esa do'stlikni buzadi",
        "task": "Bugun faqat rost gapirish — xato qilsa ham rostini aytishdan qo'rqmaslik",
    },
    "laziness": {
        "label": "dangasalik, ishyoqmaslik",
        "why": "harakat va mehnat orzularni ushaydi, dangasalik imkoniyatlarni qo'ldan boy beradi",
        "task": "Bugun bitta foydali ishni boshlab, oxirigacha o'zi bajarish",
    },
    "aggression": {
        "label": "jahldorlik, urishish",
        "why": "muloyimlik va sabr do'st orttiradi, urishish atrofdagilarni xafa qiladi",
        "task": "Bugun jahli chiqsa, chuqur nafas olib, muloyim so'z bilan gapirish",
    },
    "messiness": {
        "label": "tartibsizlik, narsalarni yig'ishtirmaslik",
        "why": "tartib bola hayotini yengillashtiradi va o'ziga ishonch beradi",
        "task": "Bugun o'yinchoq va kitoblarni o'z joy-joyiga qo'yish",
    },
    "game_addiction": {
        "label": "o'yinlarga haddan ziyod berilish",
        "why": "jonli do'stlar, sport va ijod hayotni o'yindan ko'ra boyitadi",
        "task": "Bugun ekran o'yinini cheklab, jonli o'yin yoki ijod bilan shug'ullanish",
    },
    "disrespect": {
        "label": "kattalarga hurmatsizlik",
        "why": "hurmat ko'rsatgan inson o'zi ham hurmatga sazovor bo'ladi",
        "task": "Bugun kattalar bilan muloyim va hurmat bilan gaplashish",
    },
}


def _normalize_children(children):
    """Accept a list of child dicts (new flow) or a single child dict (old flow)."""
    if isinstance(children, dict):
        children = [children]
    normalized = []
    for c in children or []:
        normalized.append({
            "name": (c.get("name") or "Kichkintoy").strip() or "Kichkintoy",
            "age": c.get("age") or 4,
            "gender": c.get("gender") or "",
            "favorite_hero": c.get("favorite_hero") or "Jasur Botir",
            "favorite_toy": c.get("favorite_toy") or "sehrli o'yinchoq",
            "favorite_animal": c.get("favorite_animal") or "",
            "favorite_cartoon": c.get("favorite_cartoon") or "",
            "favorite_color": c.get("favorite_color") or "",
            "best_friend": c.get("best_friend") or c.get("boy_friend_name") or c.get("girl_friend_name") or "yaqin do'sti",
            "hobby": c.get("hobby") or "o'ynash",
            "bad_habits": [h for h in (c.get("bad_habits") or c.get("problems") or []) if h],
        })
    return normalized


def _reader_plan(voice_mode):
    """Map a dubbing mode to readers for the 3 story segments."""
    if voice_mode == "mother":
        return ["mother", "mother", "mother"]
    if voice_mode == "father":
        return ["father", "father", "father"]
    if voice_mode == "both":
        return ["mother", "father", "duet"]
    return [None, None, None]  # no dubbing


# ---------------------------------------------------------------------------
# "Story Master" — professional child-behaviour story engine
# ---------------------------------------------------------------------------
STORY_MASTER_SYSTEM = (
    "Sen 'Story Master'san — bolalar psixologiyasi, axloqiy tarbiya, xulq-atvorni "
    "to'g'rilash va emotsional ta'lim bo'yicha jahon darajasidagi o'zbek bolalar "
    "ertakchisisan. Sening ertaklaring bolani ham qiziqtiradi, ham tarbiyalaydi. "
    "Asosiy maqsad: bola ertakni o'qib 'Men ham qahramonga o'xshashni xohlayman!' desin. "
    "MUHIM: bolani HECH QACHON to'g'ridan-to'g'ri ayblama, uyaltirma yoki quruq nasihat "
    "o'qima. Faqat voqea, his-tuyg'u va tabiiy oqibatlar orqali o'rgat. "
    "Javobni FAQAT to'g'ri (valid) JSON ko'rinishida ber — boshqa hech narsa qo'shma."
)


def _age_style(age):
    try:
        a = int(age)
    except (ValueError, TypeError):
        a = 6
    if a <= 6:
        return "4–6 yosh: til SODDA, gaplar QISQA, ko'proq sehr, ranglar va hayvonlar bo'lsin."
    if a <= 10:
        return "7–10 yosh: sarguzasht, do'stlik va yengil hazil bo'lsin, voqea jonli kechsin."
    return "11–14 yosh: mas'uliyat, maqsad, o'zlik (identity) va ichki o'sish mavzulari bo'lsin."


def _child_block(i, c):
    habits = ", ".join(
        f"{HABIT_INFO.get(h, {}).get('label', h)} (nega yomon: {HABIT_INFO.get(h, {}).get('why', '')})"
        for h in c["bad_habits"]
    ) or "alohida yomon odati yo'q"

    lines = [
        f"  {i}) Ismi: {c['name']}, yoshi: {c['age']}.",
        f"     Sevimli qahramoni: {c['favorite_hero']}.",
        f"     Sevimli o'yinchog'i: {c['favorite_toy']}.",
        f"     Eng yaqin do'sti: {c['best_friend']}.",
        f"     Yoqtirgan mashg'uloti: {c['hobby']}.",
    ]
    if c.get("gender"):
        lines.append(f"     Jinsi: {c['gender']}.")
    if c.get("favorite_animal"):
        lines.append(f"     Sevimli hayvoni: {c['favorite_animal']}.")
    if c.get("favorite_cartoon"):
        lines.append(f"     Sevimli multfilmi: {c['favorite_cartoon']}.")
    if c.get("favorite_color"):
        lines.append(f"     Sevimli rangi: {c['favorite_color']}.")
    lines.append(f"     Yengishi kerak bo'lgan yomon odat(lar)i: {habits}.")
    lines.append(f"     Yosh uslubi: {_age_style(c['age'])}")
    return "\n".join(lines)


def _build_story_prompt(kids, voice_mode):
    kids_desc = "\n".join(_child_block(i, c) for i, c in enumerate(kids, 1))

    if voice_mode == "both":
        voice_rule = (
            "Ovoz: 1-segment ONA ovozida (mehrli, shivirlab), 2-segment OTA ovozida "
            "(xotirjam, ishonchli), 3-segment ONA va OTA BIRGALIKDA o'qishi uchun yozilsin."
        )
    elif voice_mode in ("mother", "father"):
        who = "ONA" if voice_mode == "mother" else "OTA"
        voice_rule = f"Ovoz: barcha segmentlar {who} ovozida, yumshoq va mehrli ohangda o'qish uchun yozilsin."
    else:
        voice_rule = "Ovoz: oddiy, mehrli o'qish uslubida yozilsin."

    return f"""
Quyidagi farzand(lar) uchun BITTA umumiy, shaxsiylashtirilgan tarbiyaviy ertak yoz.
Hamma bolalar bitta ertakda birga BOSH QAHRAMON bo'lsin va sehrli olamda sarguzasht kechirsin:
{kids_desc}

== SHAXSIYLASHTIRISH ==
- Bola(lar) ertakning bosh qahramoni bo'lsin.
- Sevimli qahramon(lar)i tabiiy ravishda paydo bo'lsin.
- Sevimli o'yinchoq sehrli hamrohga aylansin.
- Eng yaqin do'st yordamchi qahramon bo'lsin.
- Sevimli mashg'ulot/qiziqish ASOSIY muammoni yechishda hal qiluvchi rol o'ynasin.
- Berilgan bo'lsa: sevimli hayvon, multfilm va rang ham ertakka tabiiy qo'shilsin.

== XULQ-ATVORNI TO'G'RILASH (asло ayblama!) ==
Har bir yomon odat uchun shu ketma-ketlikni voqealar bilan ko'rsat:
1) odat ko'rinadi → 2) kichik oqibat (nimadir noto'g'ri ketadi) →
3) ijtimoiy oqibat (do'stlar xafa bo'ladi) → 4) hissiy oqibat (qahramon xafa bo'ladi) →
5) uzoq oqibat (orzuga erishish qiyinlashadi) → 6) dono qahramon saboq beradi →
7) qahramon yaxshi xulqni tanlaydi → 8) mukofot (yangi do'stlar, muvaffaqiyat, ishonch, baxt).

== HISSIY YOY ==
Hayrat → Sarguzasht → Muammo → Oqibat → Anglash → O'zgarish → Muvaffaqiyat → Bayram.

== 3 SEGMENTGA JOYLASH (8 bosqich) ==
- 1-segment (KIRISH): qahramon tanishuvi + sehrli sarguzasht boshlanishi (hayrat, quvonch).
- 2-segment (SARGUZASHT): yomon odat muammo keltiradi → oqibatlar jiddiylashadi → dono qahramon mehr bilan saboq beradi.
- 3-segment (XULOSA): qahramon o'zgaradi → yaxshi odat bilan muvaffaqiyatga erishadi → baxtli yakun.
Har segment taxminan 300–450 so'z, jonli va tasvirli bo'lsin.

== YAKUN TALABI (3-segment ichida tabiiy bo'lsin) ==
- Ibrat: nimani o'rgandik.
- Ijobiy kelajak: yaxshi odat davom etsa nima bo'ladi.
- Yumshoq ogohlantirish: yomon odat qaytsa nima bo'lishi mumkin (qo'rqitmasdan).
- Motivatsiya: bolani o'zining eng yaxshi versiyasi bo'lishga ilhomlantir.

== QOIDALAR ==
- Hech qachon nasihat o'qima yoki ma'ruza qilma — voqea va his orqali o'rgat.
- Til o'zbekcha, ohangdor, mehrga to'la va yoshga mos bo'lsin.
- Sarlavha ertak mazmuniga MOS, she'riy va o'ziga xos bo'lsin (bola ismi/qahramoniga bog'liq); umumiy nom qo'yma.
- {voice_rule}

Javob FAQAT quyidagi JSON formatida bo'lsin, boshqa hech narsa qo'shma:
{{
  "title": "Ertak mazmuniga mos jozibali, she'riy sarlavha",
  "moral": "Ertakdan kelib chiqadigan ibratli, qisqa xulosa (1–2 jumla)",
  "task": "Bola uchun bugungi kichik, aniq va bajariladigan sehrli vazifa",
  "segments": [
    {{"part": 1, "text": "1-segment matni (kirish + sarguzasht boshlanishi)"}},
    {{"part": 2, "text": "2-segment matni (muammo + oqibatlar + saboq)"}},
    {{"part": 3, "text": "3-segment matni (o'zgarish + muvaffaqiyat + yakun va ibrat)"}}
  ]
}}
"""


def _finalize_story(result, readers, voice_mode):
    segs = result.get("segments") or []
    segments = []
    full_parts = []
    for idx in range(3):
        text = segs[idx].get("text", "") if idx < len(segs) else ""
        full_parts.append(text)
        segments.append({"reader": readers[idx], "text": text})

    return {
        "title": result.get("title", "Sehrli Ertak"),
        "story": "\n\n".join(p for p in full_parts if p),
        "moral": result.get("moral", ""),
        "task": result.get("task", ""),
        "segments": segments,
        "voice_mode": voice_mode,
    }


def _generate_openai_compatible(children, voice_mode, *, api_key, model, provider, base_url=None):
    """Generate a story via any OpenAI-compatible chat API (OpenAI, xAI/Grok, ...)."""
    if not api_key:
        return None
    kids = _normalize_children(children)
    if not kids:
        return None

    readers = _reader_plan(voice_mode)
    prompt = _build_story_prompt(kids, voice_mode)

    try:
        client = openai.OpenAI(api_key=api_key, base_url=base_url) if base_url else openai.OpenAI(api_key=api_key)
    except Exception as e:
        print(f"{provider} client init error:", e)
        return None

    # Retry transient overload / rate-limit errors before giving up to the next provider
    last_err = None
    for attempt in range(3):
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": STORY_MASTER_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
            )
            result = json.loads(response.choices[0].message.content)
            return _finalize_story(result, readers, voice_mode)
        except Exception as e:
            last_err = e
            is_transient = any(m in str(e).lower() for m in _TRANSIENT_MARKERS)
            if is_transient and attempt < 2:
                time.sleep(1.5 * (attempt + 1))  # 1.5s, then 3s
                continue
            break

    print(f"{provider} Error:", last_err)
    return None


# ---------------------------------------------------------------------------
# Provider wrappers
# ---------------------------------------------------------------------------
def generate_family_story_gemini(children, voice_mode="none"):
    """Gemini (Google) — primary AI provider. Needs GEMINI_API_KEY (+ optional GEMINI_MODEL).

    Uses Google's OpenAI-compatible endpoint so the same client logic is reused.
    """
    return _generate_openai_compatible(
        children, voice_mode,
        api_key=os.getenv("GEMINI_API_KEY"),
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite"),
        provider="Gemini",
        base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
    )


def generate_family_story_xai(children, voice_mode="none"):
    """Grok (xAI) — primary AI provider. Needs XAI_API_KEY (+ optional XAI_MODEL)."""
    return _generate_openai_compatible(
        children, voice_mode,
        api_key=os.getenv("XAI_API_KEY"),
        model=os.getenv("XAI_MODEL", "grok-3"),
        provider="xAI (Grok)",
        base_url="https://api.x.ai/v1",
    )


def generate_family_story_openai(children, voice_mode="none"):
    """OpenAI — optional fallback. Needs OPENAI_API_KEY (+ optional OPENAI_MODEL)."""
    return _generate_openai_compatible(
        children, voice_mode,
        api_key=os.getenv("OPENAI_API_KEY"),
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        provider="OpenAI",
    )


# ---------------------------------------------------------------------------
# Offline family-story generator (no API key required)
# ---------------------------------------------------------------------------
def generate_family_story_offline(children, voice_mode="none"):
    kids = _normalize_children(children)
    if not kids:
        kids = _normalize_children([{}])

    readers = _reader_plan(voice_mode)
    names = [c["name"] for c in kids]

    if len(names) == 1:
        names_text = names[0]
    elif len(names) == 2:
        names_text = f"{names[0]} va {names[1]}"
    else:
        names_text = ", ".join(names[:-1]) + f" va {names[-1]}"

    title = f"{names_text} Nana Banana olamida"

    # --- Part 1: Kirish (introduce the children) ---
    intro = (
        f"Shirin va rang-barang Nana Banana olamida {names_text} ismli quvnoq bolalar yashar ekan. "
    )
    for c in kids:
        intro += (
            f"{c['name']} {c['age']} yoshda bo'lib, sevimli o'yinchog'i {c['favorite_toy']} bilan "
            f"{c['hobby']}ni juda yaxshi ko'rar, eng yaqin do'sti {c['best_friend']} bilan birga o'ynar ekan. "
        )

    # --- Part 2: Sarguzasht (each child's bad habit gently shown) ---
    adventure = ""
    all_habits = []
    for c in kids:
        for h in c["bad_habits"]:
            info = HABIT_INFO.get(h)
            if not info:
                continue
            all_habits.append(info)
            adventure += (
                f"Ammo {c['name']}da bir odat bor ekan — {info['label']}. "
                f"Buni ko'rib, uning sevimli qahramoni {c['favorite_hero']} mehr bilan shunday debdi: "
                f"\"{c['name']}jon, {info['why']}.\" "
            )
    if not adventure:
        adventure = (
            f"Bir kuni Nana Banana olamining mehribon qahramonlari kelib, bolalarga go'zal "
            f"xulq-atvor va do'stlik haqida shirin hikoyalar aytib berishibdi. "
        )

    # --- Part 3: Xulosa (children change) ---
    conclusion = (
        f"{names_text} bu mehrli so'zlarga quloq solibdi. Ular yomon odatlarini bir chetga qo'yib, "
        f"yana quvnoq, baquvvat va shirinso'z bolalarga aylanishibdi. Nana Banana olami ularning "
        f"ko'ngli kabi yana yorishib, hammayoq sehrli nur bilan to'libdi. Shundan so'ng bolalar "
        f"har kuni yaxshi ish qilishga va'da berishibdi."
    )

    # Moral & task from collected habits
    if all_habits:
        moral = "Har bir yaxshi odat bizni kuchli, aqlli va mehribon qiladi — yomon odatdan voz kechish esa eng katta qahramonlikdir."
        task = all_habits[0]["task"]
    else:
        moral = "Shirinso'zlik, do'stlik va yaxshi xulq dunyodagi eng katta sehrdir."
        task = "Bugun uydagilarga bir yaxshilik qilish va tabassum ulashish"

    parts = [intro.strip(), adventure.strip(), conclusion.strip()]
    segments = [{"reader": readers[i], "text": parts[i]} for i in range(3)]

    return {
        "title": title,
        "story": "\n\n".join(parts),
        "moral": moral,
        "task": task,
        "segments": segments,
        "voice_mode": voice_mode,
    }


# ---------------------------------------------------------------------------
# Backward-compatible single-child helpers (old flow)
# ---------------------------------------------------------------------------
def generate_story_openai(child, problem_key):
    c = dict(child)
    c["bad_habits"] = [problem_key]
    c["best_friend"] = child.get("boy_friend_name") or child.get("girl_friend_name") or "yaqin do'sti"
    c["favorite_toy"] = child.get("favorite_toy") or "sehrli o'yinchoq"
    return generate_family_story_openai([c], voice_mode="none")


def generate_personalized_story_offline(child, problem_key):
    c = dict(child)
    c["bad_habits"] = [problem_key]
    c["best_friend"] = child.get("boy_friend_name") or child.get("girl_friend_name") or "yaqin do'sti"
    c["favorite_toy"] = child.get("favorite_toy") or "sehrli o'yinchoq"
    return generate_family_story_offline([c], voice_mode="none")
