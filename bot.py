import os
import json
import urllib.parse
from flask import Flask, request, jsonify
import telebot
from telebot.types import Update, InlineKeyboardMarkup, InlineKeyboardButton
from dotenv import load_dotenv

# Import local helpers
import db
import story_generator

# Load environment variables
load_dotenv()

TOKEN = os.getenv("TELEGRAM_TOKEN", "8865315152:AAFZ65EzM8wW62SHqtZy4GYHqAEkU5jHuWA")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://ona-bola-vo1p.vercel.app" if os.environ.get("VERCEL") else "http://127.0.0.1:5000")
bot = telebot.TeleBot(TOKEN)

app = Flask(__name__, static_folder='static', static_url_path='')

@app.after_request
def add_header(r):
    r.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    r.headers["Pragma"] = "no-cache"
    r.headers["Expires"] = "0"
    return r

# Initialize Database
db.init_db()

# Create uploads/voices folder if it doesn't exist (handle read-only envs)
try:
    os.makedirs("static/uploads/voices", exist_ok=True)
except Exception as e:
    print("Could not create static uploads directory (Vercel read-only?):", e)

# Inline keyboard helper to open Telegram Mini App
def get_webapp_keyboard(telegram_id, referral_code=None):
    url = WEBAPP_URL
    if referral_code:
        url += f"?start={referral_code}"
    else:
        url += f"?start=ref_{telegram_id}"
        
    markup = InlineKeyboardMarkup()
    btn = InlineKeyboardButton("👶 Ona & Bola ilovasini ochish", web_app=telebot.types.WebAppInfo(url=url))
    markup.add(btn)
    return markup

# Telegram Bot Message Handlers
@bot.message_handler(commands=["start"])
def handle_start(message):
    telegram_id = message.chat.id
    username = message.chat.username or ""
    full_name = f"{message.chat.first_name or ''} {message.chat.last_name or ''}".strip() or "Foydalanuvchi"
    
    # Check if there is a referral parameter in the start command
    # e.g., /start ref_12345
    referred_by = None
    command_text = message.text.split()
    if len(command_text) > 1:
        ref_param = command_text[1]
        if ref_param.startswith("ref_"):
            referred_by = ref_param
            
    # Create or update user in database
    try:
        user = db.create_user(telegram_id, username, full_name, referred_by=referred_by)
    except Exception as e:
        print("DB create_user error:", e)
    
    # Welcome message
    welcome_text = (
        f"👶 *Assalomu alaykum, {full_name}!*\n\n"
        f"Ona & Bola - Sun'iy Intellekt yordamida bolalar tarbiyasi va "
        f"rivojlanishiga ko'maklashuvchi Telegram Mini App-ga xush kelibsiz!\n\n"
        f"📱 *Mini App orqali siz:*\n"
        f"• Farzandingiz uchun maxsus AI ertaklar yaratishingiz;\n"
        f"• Bolalarni telefonga qaramlikdan qutqarish uchun topshiriqlar berishingiz;\n"
        f"• Kunlik tarbiyaviy maslahatlar va statistika bilan tanishishingiz mumkin.\n\n"
        f"Boshlash uchun quyidagi tugmani bosing:"
    )
    
    # Send ONE welcome message: clears old reply keyboard + shows inline WebApp button
    try:
        bot.send_message(
            telegram_id,
            welcome_text,
            parse_mode="Markdown",
            reply_markup=get_webapp_keyboard(telegram_id)
        )
    except Exception as e:
        print("Failed to send welcome message:", e)
        # Fallback: send without Markdown in case formatting causes issues
        try:
            bot.send_message(
                telegram_id,
                welcome_text.replace("*", ""),
                reply_markup=get_webapp_keyboard(telegram_id)
            )
        except Exception as e2:
            print("Fallback message also failed:", e2)
    
    # Try to set menu button (non-critical, don't block)
    try:
        url = WEBAPP_URL + f"?start=ref_{telegram_id}"
        bot.set_chat_menu_button(
            chat_id=telegram_id, 
            menu_button=telebot.types.MenuButtonWebApp(
                text="👶 Ilovani ochish", 
                web_app=telebot.types.WebAppInfo(url=url)
            )
        )
    except Exception as e:
        print("Failed to set menu button:", e)

# Catch-all handler for other text or old buttons
@bot.message_handler(func=lambda message: True)
def handle_all_messages(message):
    telegram_id = message.chat.id
    full_name = f"{message.chat.first_name or ''} {message.chat.last_name or ''}".strip() or "Foydalanuvchi"
    
    welcome_text = (
        f"👶 *Hurmatli {full_name}!*\n\n"
        f"Ona & Bola loyihamiz to'liq yangilandi! Endi barcha bo'limlar, maslahatlar va "
        f"AI ertaklar faqatgina bizning qulay *Mini App* ilovamiz ichida joylashgan. 📱\n\n"
        f"Pastdagi tugmani bosib ilovaga kiring:"
    )
    
    # Send ONE message with inline WebApp button
    try:
        bot.send_message(
            telegram_id,
            welcome_text,
            parse_mode="Markdown",
            reply_markup=get_webapp_keyboard(telegram_id)
        )
    except Exception as e:
        print("Failed to send catch-all message:", e)
        try:
            bot.send_message(telegram_id, welcome_text.replace("*", ""), reply_markup=get_webapp_keyboard(telegram_id))
        except Exception as e2:
            print("Fallback catch-all also failed:", e2)
    
    # Try to set menu button (non-critical)
    try:
        url = WEBAPP_URL + f"?start=ref_{telegram_id}"
        bot.set_chat_menu_button(
            chat_id=telegram_id, 
            menu_button=telebot.types.MenuButtonWebApp(
                text="👶 Ilovani ochish", 
                web_app=telebot.types.WebAppInfo(url=url)
            )
        )
    except Exception as e:
        print("Failed to set menu button:", e)

# --- Flask API Routes ---

@app.route("/")
def index():
    # Automatically set webhook if running on Vercel
    if os.environ.get("VERCEL"):
        try:
            host = request.host
            webhook_url = f"https://{host}/{TOKEN}"
            bot.set_webhook(url=webhook_url)
            print(f"Webhook successfully registered: {webhook_url}")
        except Exception as e:
            print("Failed to auto-register webhook:", e)
    return app.send_static_file("index.html")

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.json or {}
    init_data = data.get("initData", "")
    referred_by = data.get("referred_by")
    
    telegram_id = None
    username = ""
    full_name = ""
    
    # Parse Telegram initData
    if init_data:
        try:
            params = urllib.parse.parse_qs(init_data)
            if "user" in params:
                user_str = urllib.parse.unquote(params["user"][0])
                user_info = json.loads(user_str)
                telegram_id = user_info.get("id")
                username = user_info.get("username", "")
                full_name = f"{user_info.get('first_name', '')} {user_info.get('last_name', '')}".strip()
        except Exception as e:
            print("Error parsing initData:", e)
            
    # Fallback for local testing (if opened in direct browser without Telegram context)
    if not telegram_id:
        telegram_id = data.get("telegram_id")
        username = data.get("username", "local_user")
        full_name = data.get("full_name", "Local Tester")
        
    if not telegram_id:
        return jsonify({"error": "Foydalanuvchi ma'lumotlari aniqlanmadi"}), 400

    try:
        telegram_id = int(telegram_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Noto'g'ri foydalanuvchi IDsi"}), 400
        
    # Get or create user
    user = db.create_user(telegram_id, username, full_name, referred_by=referred_by)
    children = db.get_children(telegram_id)
    child = children[0] if children else None

    return jsonify({
        "success": True,
        "user": {
            "telegram_id": user["telegram_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "mother_name": user.get("mother_name", "") or "",
            "father_name": user.get("father_name", "") or "",
            "subscription_status": user["subscription_status"],
            "subscription_expires_at": user["subscription_expires_at"],
            "bonus_tokens": user["bonus_tokens"],
            "referral_code": user["referral_code"]
        },
        "child": child,
        "children": children,
        "samples_count": db.get_voice_samples_count(telegram_id)
    })

@app.route("/api/save_profile", methods=["POST"])
def api_save_profile():
    data = request.json or {}
    telegram_id = data.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Unauthorized"}), 401
    try:
        telegram_id = int(telegram_id)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid user ID"}), 400
        
    mother_name = data.get("mother_name", "")
    father_name = data.get("father_name", "")
    children_payload = data.get("children")

    if children_payload:
        # New flow: full anketa for every child, persisted once
        children = db.save_children(telegram_id, children_payload, mother_name=mother_name, father_name=father_name)
        child = children[0] if children else None
    else:
        # Backward-compatible single-child flow
        name = data.get("name")
        age = int(data.get("age", 0))
        favorite_hero = data.get("favorite_hero", "")
        favorite_animal = data.get("favorite_animal", "")
        favorite_toy = data.get("favorite_toy", "")
        boy_friend = data.get("boy_friend", "")
        girl_friend = data.get("girl_friend", "")
        problems = data.get("problems", [])
        child = db.save_child_profile(
            telegram_id, name, age, favorite_hero, favorite_animal, favorite_toy, boy_friend, girl_friend, problems,
            mother_name=mother_name, father_name=father_name
        )
        children = db.get_children(telegram_id)

    user = db.get_user(telegram_id)

    return jsonify({
        "success": True,
        "child": child,
        "children": children,
        "user": {
            "telegram_id": user["telegram_id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "mother_name": user.get("mother_name", "") or "",
            "father_name": user.get("father_name", "") or "",
            "subscription_status": user["subscription_status"],
            "subscription_expires_at": user["subscription_expires_at"],
            "bonus_tokens": user["bonus_tokens"],
            "referral_code": user["referral_code"]
        }
    })

@app.route("/api/get_stories", methods=["GET"])
def api_get_stories():
    telegram_id = request.args.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    child = db.get_child_profile(telegram_id)
    if not child:
        return jsonify({"stories": []})
        
    stories = db.get_stories(child["id"])
    return jsonify({"stories": stories})

@app.route("/api/generate_story", methods=["POST"])
def api_generate_story():
    data = request.json or {}
    telegram_id = data.get("telegram_id")

    # New flow: a list of children (anketa) + a dubbing/voice mode.
    children = data.get("children")
    voice_mode = data.get("voice_mode", "none")

    # Old flow (backward compatible): a single problem_key against the saved profile.
    problem_key = data.get("problem_key")

    if not telegram_id:
        return jsonify({"error": "Parametrlar yetarli emas"}), 400

    # Build the list of children to feature in the story
    if children:
        kids = children
    else:
        child = db.get_child_profile(telegram_id)
        if not child:
            return jsonify({"error": "Bola profili topilmadi"}), 404
        if problem_key:
            child = dict(child)
            child["bad_habits"] = [problem_key]
        kids = [child]

    if not kids:
        return jsonify({"error": "Kamida bitta farzand kerak"}), 400

    # Spend token (one combined story = one token)
    if not db.spend_token(telegram_id):
        return jsonify({
            "error": "Sizda ertak yaratish uchun tokenlar tugadi. Premium obuna bo'ling yoki referral havola orqali do'stlarni taklif qiling!"
        }), 403

    # Try Gemini first, then Grok (xAI), then OpenAI, then offline templates
    story_data = story_generator.generate_family_story_gemini(kids, voice_mode)
    if not story_data:
        story_data = story_generator.generate_family_story_xai(kids, voice_mode)
    if not story_data:
        story_data = story_generator.generate_family_story_openai(kids, voice_mode)
    if not story_data:
        story_data = story_generator.generate_family_story_offline(kids, voice_mode)

    # The combined story is attached to the user's primary child profile (for the library)
    profile = db.get_child_profile(telegram_id)
    child_db_id = profile["id"] if profile else None

    # Determine a representative problem_key (first bad habit found) for illustrations/back-compat
    first_habit = problem_key
    if not first_habit:
        for k in kids:
            habits = k.get("bad_habits") or k.get("problems") or []
            if habits:
                first_habit = habits[0]
                break

    segments = story_data.get("segments", [])
    story_id = None
    if child_db_id:
        story_id = db.save_story(
            child_db_id,
            story_data["title"],
            story_data["story"],
            story_data["moral"],
            story_data["task"],
            problem_key=first_habit,
            segments_json=json.dumps(segments, ensure_ascii=False),
            voice_mode=voice_mode,
        )

    user = db.get_user(telegram_id)

    return jsonify({
        "success": True,
        "story": {
            "id": story_id,
            "title": story_data["title"],
            "content_text": story_data["story"],
            "moral_lesson": story_data["moral"],
            "daily_task": story_data["task"],
            "problem_key": first_habit,
            "segments": segments,
            "voice_mode": voice_mode,
        },
        "user": {
            "bonus_tokens": user["bonus_tokens"],
            "subscription_status": user["subscription_status"]
        }
    })

@app.route("/api/tasks", methods=["GET"])
def api_get_tasks():
    telegram_id = request.args.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    child = db.get_child_profile(telegram_id)
    if not child:
        return jsonify({"tasks": []})
        
    tasks = db.get_daily_tasks(child["id"], child["problems"])
    return jsonify({"tasks": tasks})

@app.route("/api/tasks/toggle", methods=["POST"])
def api_toggle_task():
    data = request.json or {}
    task_id = data.get("task_id")
    is_completed = data.get("is_completed")
    
    if task_id is None or is_completed is None:
        return jsonify({"error": "Parametrlar yetarli emas"}), 400
        
    db.toggle_task(task_id, is_completed)
    return jsonify({"success": True})

@app.route("/api/referral", methods=["GET"])
def api_referral():
    telegram_id = request.args.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Unauthorized"}), 401
        
    info = db.get_referral_info(telegram_id)
    return jsonify(info)

@app.route("/api/subscribe", methods=["POST"])
def api_subscribe():
    data = request.json or {}
    telegram_id = data.get("telegram_id")
    plan_type = data.get("plan_type")
    
    if not telegram_id or not plan_type:
        return jsonify({"error": "Parametrlar yetarli emas"}), 400
        
    user = db.update_subscription(telegram_id, plan_type)
    return jsonify({
        "success": True,
        "user": {
            "subscription_status": user["subscription_status"],
            "subscription_expires_at": user["subscription_expires_at"],
            "bonus_tokens": user["bonus_tokens"]
        }
    })

@app.route("/api/upload_voice", methods=["POST"])
def api_upload_voice():
    telegram_id = request.form.get("telegram_id")
    role = request.form.get("role")
    segment_id = request.form.get("segment_id")
    
    if not telegram_id or not role:
        return jsonify({"error": "Foydalanuvchi yoki rol aniqlanmadi"}), 400
        
    if "voice" not in request.files:
        return jsonify({"error": "Audio fayl topilmadi"}), 400
        
    voice_file = request.files["voice"]
    if voice_file.filename == "":
        return jsonify({"error": "Audio fayl nomi xato"}), 400
        
    import time
    timestamp = int(time.time())
    filename = f"{telegram_id}_{role}_seg{segment_id}_{timestamp}.webm"
    file_path = os.path.join("static/uploads/voices", filename)
    
    # Save file to disk (fallback to /tmp if read-only)
    db_relative_path = f"uploads/voices/{filename}"
    try:
        voice_file.save(file_path)
        db.save_voice_sample(telegram_id, role, db_relative_path)
    except Exception as e:
        print("Could not save voice to static uploads folder (Vercel read-only?):", e)
        try:
            tmp_path = os.path.join("/tmp", filename)
            voice_file.save(tmp_path)
            db.save_voice_sample(telegram_id, role, f"tmp/{filename}")
            print(f"Saved fallback voice to {tmp_path}")
        except Exception as tmp_err:
            print("Failed to save voice even to /tmp:", tmp_err)
    counts = db.get_voice_samples_count(telegram_id)
    
    return jsonify({
        "success": True,
        "samples_count": counts
    })

@app.route("/api/reset_voice", methods=["POST"])
def api_reset_voice():
    data = request.json or {}
    telegram_id = data.get("telegram_id")
    if not telegram_id:
        return jsonify({"error": "Foydalanuvchi aniqlanmadi"}), 400
        
    db.delete_voice_samples(telegram_id)
    return jsonify({"success": True})

@app.route("/api/debug", methods=["GET"])
def api_debug():
    debug_info = {}
    
    # 1. Check database status
    debug_info["db_path"] = db.DB_PATH
    debug_info["db_exists"] = os.path.exists(db.DB_PATH)
    if debug_info["db_exists"]:
        try:
            debug_info["db_size"] = os.path.getsize(db.DB_PATH)
            conn = db.get_db()
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            debug_info["tables"] = [r[0] for r in cursor.fetchall()]
            try:
                cursor.execute("SELECT * FROM users")
                debug_info["users"] = [dict(r) for r in cursor.fetchall()]
            except Exception as ue:
                debug_info["users_error"] = str(ue)
            conn.close()
        except Exception as e:
            debug_info["db_error"] = str(e)
            
    # 2. Check environment variables
    debug_info["vercel_env"] = os.environ.get("VERCEL")
    debug_info["telegram_token_set"] = bool(os.environ.get("TELEGRAM_TOKEN"))
    
    # 3. Check Telegram Webhook info
    try:
        wh_info = bot.get_webhook_info()
        debug_info["webhook_info"] = {
            "url": wh_info.url,
            "has_custom_certificate": wh_info.has_custom_certificate,
            "pending_update_count": wh_info.pending_update_count,
            "last_error_date": wh_info.last_error_date,
            "last_error_message": wh_info.last_error_message,
            "max_connections": wh_info.max_connections,
            "ip_address": wh_info.ip_address
        }
    except Exception as e:
        debug_info["webhook_error"] = str(e)
        
    return jsonify(debug_info), 200

# Webhook route for Telegram Bot
@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    json_data = request.get_json()
    update = Update.de_json(json_data)
    bot.process_new_updates([update])
    return "OK", 200

# Dev server runner
if __name__ == "__main__":
    # Start polling for development in a background thread or directly if not run under server
    # Since we are running both Flask and Bot, polling in dev is easier.
    # We remove webhook configuration to run polling locally.
    bot.remove_webhook()
    
    # We run telebot in a separate non-blocking thread so Flask can run
    import threading
    bot_thread = threading.Thread(target=bot.infinity_polling)
    bot_thread.daemon = True
    bot_thread.start()
    
    print("Bot polling started...")
    print("Starting Flask web server on http://127.0.0.1:5000")
    app.run(host="0.0.0.0", port=5000, debug=True, use_reloader=False)
