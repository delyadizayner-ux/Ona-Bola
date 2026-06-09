import os
import json
import openai

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
            "favorite_hero": c.get("favorite_hero") or "Jasur Botir",
            "favorite_toy": c.get("favorite_toy") or "sehrli o'yinchoq",
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
# AI prompt building (shared by every OpenAI-compatible provider)
# ---------------------------------------------------------------------------
def _build_story_prompt(kids, voice_mode):
    kids_desc = ""
    for i, c in enumerate(kids, 1):
        habits = ", ".join(HABIT_INFO.get(h, {}).get("label", h) for h in c["bad_habits"]) or "alohida yomon odati yo'q"
        kids_desc += (
            f"\n  {i}) Ismi: {c['name']}, yoshi: {c['age']}. "
            f"Sevimli qahramoni: {c['favorite_hero']}. "
            f"Sevimli o'yinchog'i: {c['favorite_toy']}. "
            f"Eng yaqin do'sti: {c['best_friend']}. "
            f"Yoqtirgan mashg'uloti: {c['hobby']}. "
            f"Yengilishi kerak bo'lgan yomon odat(lar)i: {habits}."
        )

    if voice_mode == "both":
        voice_rule = (
            "Ertak ROSA 3 ta qismdan iborat bo'lsin. 1-qism ONA ovozida (mehrli, shivirlab), "
            "2-qism OTA ovozida (xotirjam, ishonchli), 3-qism (xulosa) ONA va OTA BIRGALIKDA o'qishi uchun yozilsin."
        )
    elif voice_mode in ("mother", "father"):
        who = "ONA" if voice_mode == "mother" else "OTA"
        voice_rule = f"Ertak 3 ta qismdan iborat bo'lsin va barchasi {who} ovozida o'qish uchun yumshoq, mehrli ohangda yozilsin."
    else:
        voice_rule = "Ertak 3 ta teng qismga (sahifaga) bo'linsin."

    return f"""
Sen O'zbekistonning eng mashhur bolalar ertakchilaridan birisan — sening ertaklaring kitob qilib nashr etiladi.
Yozish uslubing mumtoz xalq ertaklariday ohangdor, she'riy, mehrga to'la va tarbiyaviy bo'lsin.

Quyidagi farzand(lar) uchun BITTA umumiy ertak yoz. Hamma bolalar bitta ertakda birga bosh qahramon bo'lsin va
"Nana Banana" sehrli, rang-barang olamida sarguzasht kechirsin:
{kids_desc}

Ertak qoidalari:
1. Har bir bolaning sevimli qahramoni, o'yinchog'i, eng yaqin do'sti va yoqtirgan mashg'uloti ertak voqealariga tabiiy ravishda qo'shilsin.
2. Har bir bolaning yomon odati ertak ichida YUMSHOQ va ibratli tarzda ko'rsatilsin: bu odat nega yomonligini bola tushunsin va oxirida o'z xohishi bilan undan voz kechsin. Salbiy oqibatlar qo'rqitmasdan, mehr bilan tasvirlansin.
3. Bolalarga bu yomon odatlardan voz kechish uchun ma'naviy ozuqa beradigan, ilhomlantiruvchi xulosa bo'lsin.
4. Sarlavha (title) ertak mazmuniga MOS, jozibali, o'ziga xos va she'riy bo'lsin — bolaning ismi yoki ertak qahramoni/voqeasiga bog'lansin. "Nana Banana olamida" kabi umumiy nom QO'YMA.
5. {voice_rule}
6. Javob FAQAT quyidagi JSON formatida bo'lsin, boshqa hech narsa qo'shma:
{{
  "title": "Ertak mazmuniga mos jozibali sarlavha",
  "moral": "Ertakdan kelib chiqadigan ibratli, qisqa xulosa",
  "task": "Bolalar uchun bugungi kichik sehrli vazifa",
  "segments": [
    {{"part": 1, "text": "1-qism matni (kirish)"}},
    {{"part": 2, "text": "2-qism matni (sarguzasht)"}},
    {{"part": 3, "text": "3-qism matni (xulosa)"}}
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
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
        )
        result = json.loads(response.choices[0].message.content)
        return _finalize_story(result, readers, voice_mode)
    except Exception as e:
        print(f"{provider} Error:", e)
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
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
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
