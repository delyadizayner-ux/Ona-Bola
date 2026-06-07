import os
import json
import openai

def generate_story_openai(child, problem_key):
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
        
    client = openai.OpenAI(api_key=api_key)
    
    problems_expl = {
        "screentime": "telefon va sehrli ekranga qaramlik, ko'p vaqtini telefonda o'tkazish",
        "teeth_brush": "tish yuvishni yoqtirmaslik va shaxsiy gigiyenaga rioya qilmaslik",
        "food": "zararli shirinliklar va fast-food yeyish, foydali taomlarni rad etish",
        "bedtime": "kech uxlash, vaqtida uxlamaslik va uyquga to'ymaslik",
        "behavior": "ujarlik qilish, ota-ona so'ziga quloq solmaslik va jizzakilik"
    }
    
    prob_desc = problems_expl.get(problem_key, "yaxshi xulq-atvor va odob-ahloq")
    
    prompt = f"""
    Sen bolalar psixologiyasi bo'yicha mutaxassis va professional bolalar kitoblari mualliflaridan tashkil topgan badiiy kengash a'zosisan.
    Sening yozgan ertaklaring shunchaki oddiy ertak emas, balki bolalar uchun nashrga tayyorlangan, mehr bilan yo'g'rilgan va she'riy ohangga ega professional badiiy asardir.
    Quyidagi parametrlardan foydalanib, bolaga o'zbek tilida o'ta qiziqarli, qisqa va tarbiyaviy ertak yozib ber:
    - Bolaning ismi: {child['name']}
    - Yoshi: {child['age']} yosh
    - Sevimli qahramoni: {child['favorite_hero']} ("Nana Banana" sehrli olamining sarguzashtchisi sifatida)
    - Sevimli hayvoni: {child['favorite_animal']}
    - Sevimli o'yinchog'i: {child['favorite_toy']}
    - Yaqin do'stlari: {child['boy_friend_name']}, {child['girl_friend_name']}
    
    Muammo va bartaraf etilishi kerak bo'lgan odat: {prob_desc}
    
    Ertak yozish qoidalari:
    1. Ertak tili yengil, jozibali, she'riy ritmga ega bo'lib, ota va ona bir-birini to'ldirib duet o'qishiga juda mos bo'lsin.
    2. Muhit va qahramonlar "Nana Banana" sehrli, rang-barang va shirin dunyosida joylashsin.
    3. Bolaning ismi bosh qahramon bo'lsin. Salbiy odat oqibatlari juda yumshoq va ibratli ko'rsatilib, oxirida bola bu odatdan o'z xohishi bilan kechsin.
    4. Ertak oxirida bola uchun bitta kichik va qiziqarli topshiriq (vazifa) berilsin.
    5. Ertak matni o'zaro teng 3 ta qismga (sahifaga) bo'linadigan qilib yozilsin.
    6. Javob faqat va faqat quyidagi JSON formatida bo'lsin, boshqa hech qanday so'z qo'shma:
    {{
      "title": "Ertak nomi",
      "story": "Ertak matni...",
      "moral": "Ertakdan kelib chiqadigan ibratli xulosa",
      "task": "Bola uchun bugungi sehrli vazifa"
    }}
    """
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that outputs only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        result = json.loads(response.choices[0].message.content)
        return result
    except Exception as e:
        print("OpenAI Error:", e)
        return None

def generate_personalized_story_offline(child, problem_key):
    name = child['name']
    hero = child['favorite_hero'] or "Jasur Botir"
    animal = child['favorite_animal'] or "Sassiqvoy quyoncha"
    toy = child['favorite_toy'] or "Sehrli mashina"
    bf = child['boy_friend_name'] or "Kamron"
    gf = child['girl_friend_name'] or "Laylo"
    age = child['age']
    
    # Nana Banana themed offline stories with literary quality split into 3 segments
    templates = {
        "screentime": {
            "title": f"{name} va Nana Banana olamidagi Sehrli Ekran",
            "story": f"Shirin va rang-barang Nana Banana olamida {name} ismli juda aqlli bola yashar ekan. U {age} yoshda bo'lib, eng sevimli do'sti {animal} va sevimli o'yinchog'i {toy} bilan o'ynashni sevar ekan. Kunlardan bir kuni, {name} miltillab turgan sehrli ekranli telefon topib olibdi. U ekran shu qadar sehrli ekan-ki, {name} u bilan tunu-kun o'ynay boshlabdi va sevimli do'stlari {bf} va {gf}ni ham butunlay unutibdi. Oqibatda ko'zlari charchab, porlashdan to'xtabdi.\n\nBuni ko'rib, Nana Banana dunyosining bosh qahramoni {hero} uchib kelibdi. {hero} o'zining oltin rang sehrli bananidan yoqimli musiqa taratib shunday debdi: '{name}jon, hayot sehrli ekranlardan ancha chiroyli! Sening yaqin do'sting {animal} va sevimli o'yinchog'ing {toy} seni sog'indi. Kel, bu ekranni bir chetga qo'yamiz va birga ajoyib sarguzashtlarga boramiz!'\n\n{name} sevimli qahramonining so'zlariga quloq solibdi. U sehrli ekranni yopib, do'sti {animal} bilan maysazorlarda quvnoq yugurib o'ynay boshlabdi. Uning ko'zlari yana yulduzdek porlab, tanasiga quvvat qaytibdi. Shundan so'ng, u telefonni faqat juda oz vaqt o'ynashga va'da beribdi.",
            "moral": "Haqiqiy sarguzashtlar sehrli ekranlar ichida emas, balki yaqin do'stlarimiz bilan birga bo'lganimizda sodir bo'ladi.",
            "task": "Bugun telefondan foydalanishni cheklab, sevimli o'yinchog'ing bilan 20 daqiqa o'ynash."
        },
        "teeth_brush": {
            "title": f"{name} va Tishlar Saltanatidagi Oltin Cho'tka",
            "story": f"Ertaklar o'lkasidagi sehrli Nana Banana bog'ida {name} ismli bolakay har kuni mazali shirinliklar yer ekan, lekin tishini yuvishni aslo yoqtirmas ekan. Uning sevimli do'sti {animal} va o'yinchog'i {toy} esa har kuni tishlarini marvariddek yaltiratib yurishar ekan. Kunlardan bir kuni {name}ning tishlariga kichik Mikrobvoylar hujum qilib, tishlarini og'rita boshlabdi. {name} og'riqdan yig'lab yotganda, tushida sehrli olam paydo bo'libdi.\n\nTushida Nana Banana qahramoni {hero} oltin tish cho'tkasi bilan yetib kelibdi va mikrobiologlarni quvib yuboribdi. {hero} {name}ga mehr bilan shunday debdi: 'Qahramon bo'lish uchun tishlarni toza saqlash lozim! Har gal tishingni yuvganingda, u yulduzdek yaltirab, senga kuch beradi'.\n\nErtalab {name} uyg'onibdi va darhol cho'tkani olibdi. U do'stlari {bf} va {gf} kabi har kuni tishlarini ikki marta yuvishni odat qilibdi va tishlari yana marvariddek yarqirab ketibdi.",
            "moral": "Tishlarni muntazam tozalash bizni mikrobiologlardan himoya qiladi va tabassumimizni go'zal qiladi.",
            "task": "Bugun kechqurun uxlashdan oldin tishlarni yuvish va do'stingiz {animal}ga ham buni ko'rsatish."
        },
        "food": {
            "title": f"{name} va Kuch-quvvat mevalari bog'i",
            "story": f"{name} har kuni faqat fast-food va shirinliklar yegisi kelar, onajonining pishirgan vitaminli sabzavotlarini rad etar ekan. Uning sevimli o'yinchog'i {toy} va yaqin do'sti {animal} esa faqat mevalar yeb, baquvvat bo'lib o'sishayotgan ekan. Bir kuni do'stlari {bf} va {gf} bilan o'rmonda yugurish musobaqasi o'tkazilibdi. {name} bir necha qadam yugurib, charchab yiqilibdi va yig'lay boshlabdi.\n\nShunda bog'dagi sehrli daraxt ortidan Nana Banana qahramoni {hero} chiqib kelibdi. U {name}ga oltin banan va vitaminli sabzi berib, shunday debdi: 'Farzandim, haqiqiy kuch-quvvat yerda pishgan meva va sabzavotlarda bo'ladi. Ular senga tezlik va quvvat beradi!'\n\n{name} olmani yeb ko'ribdi va tanasida yengillik hamda kuch sezibdi. Musobaqada marraga birinchi bo'lib yetib kelibdi. Shundan so'ng, u foydali taomlarni juda yaxshi ko'rib yeydigan bo'libdi.",
            "moral": "Sog'lom va tabiiy ovqatlar tanamizni baquvvat, aqlimizni o'tkir qiladi.",
            "task": "Bugun onangiz tayyorlagan foydali taomni oxirigacha yeyish va bitta olma tanovul qilish."
        },
        "bedtime": {
            "title": f"{name} va Yulduzli Tun Beshigi",
            "story": f"Nana Banana vodiysida yulduzlar porlaganda hamma uxlashga tayyorgarlik ko'rar ekan. Ammo {name} kechasi vaqtida uxlagani yotishni xohlamas va telefonda multfilm ko'rgisi kelaverar ekan. Uning sevimli do'sti {animal} va sevimli {toy}i esa allaqachon shirin tushlar ko'rib yotishgan ekan. Ertasi kuni {name} maktabda mudrab qolibdi, do'stlari {bf} va {gf} bilan o'ynashga ham holi qolmabdi.\n\nKechqurun uxlashdan oldin uning oldiga sevimli qahramoni {hero} sehrli yulduzlar aravachasida uchib kelibdi. {hero} {name}ga shivirlab shunday debdi: 'Yulduzlar ko'kda yonganda, aqlli bolalar uxlashadi. Uyqu senga kuch va yangi ajoyib tushlarni sovg'a qiladi'.\n\n{name} sehrli yulduzlarga qarab ko'zini yumibdi. U sokin musiqa ostida uxlab qolibdi. Ertalab u o'zini juda baquvvat va quvnoq his qilib uyg'onibdi va har kuni vaqtida uxlashga va'da beribdi.",
            "moral": "Kechasi vaqtida uxlash tanamizni dam oldiradi va bizni yangi kunga kuchli qilib tayyorlaydi.",
            "task": "Bugun soat 21:00 da barcha ekranlarni o'chirib, uxlashga yotish."
        },
        "behavior": {
            "title": f"{name} va Oltin Tabassum Kaliti",
            "story": f"Sehrli Nana Banana o'lkasida {name} ismli bola ba'zida juda jizzakilik qilar, uydagilarga baqirar va ujarlik qilib yig'lar ekan. Uning bu qilig'idan sevimli o'yinchog'i {toy} va yaqin do'sti {animal} juda xafa bo'lib o'ynamay qo'yishibdi. Do'stlari {bf} va {gf} ham undan uzoqlashibdi.\n\n{name} yolg'iz qolib xafa bo'lganida, osmondan oltin bulut ustida Nana Banana qahramoni {hero} tushibdi. {hero} unga oltin kalit uzatibdi: 'Bu kalit - Shirinso'zlik va Tabassum kalitidir. Kimga chiroyli gapirsang va yordam bersang, bu kalit senga do'stlik eshigini ochadi'.\n\n{name} xatosini tushunibdi, onajonini quchoqlab, undan kechirim so'rabdi va tabassum qilibdi. Sehrli kalit yarqirab ketibdi va barcha do'stlari quchoq ochib unga qaytib kelishibdi.",
            "moral": "Shirinso'zlik va odob dunyodagi eng katta sehrdir va u do'stlarimizni birlashtiradi.",
            "task": "Bugun onangizga 'Sizni yaxshi ko'raman' deb aytish va bitta ishda ko'maklashish."
        }
    }
    
    return templates.get(problem_key, templates["screentime"])
