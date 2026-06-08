import sqlite3
import os
import uuid
from datetime import datetime

# If running on Vercel serverless, use the writable /tmp folder
if os.environ.get("VERCEL"):
    DB_PATH = "/tmp/onabola.db"
    # Copy starter template database from root to /tmp if not exists
    starter_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onabola.db")
    if os.path.exists(starter_db) and not os.path.exists(DB_PATH):
        try:
            import shutil
            shutil.copy2(starter_db, DB_PATH)
            print("Starter database copied to /tmp/onabola.db successfully.")
        except Exception as e:
            print("Error copying starter database to /tmp:", e)
else:
    DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "onabola.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        telegram_id INTEGER PRIMARY KEY,
        username TEXT,
        full_name TEXT,
        subscription_status TEXT DEFAULT 'free',
        subscription_expires_at TEXT,
        referred_by INTEGER,
        referral_code TEXT UNIQUE,
        bonus_tokens INTEGER DEFAULT 3,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Children table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS children (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT,
        age INTEGER,
        favorite_hero TEXT,
        favorite_animal TEXT,
        favorite_toy TEXT,
        boy_friend_name TEXT,
        girl_friend_name TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (telegram_id)
    )
    """)
    
    # Child problems table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS child_problems (
        child_id INTEGER,
        problem_key TEXT,
        PRIMARY KEY (child_id, problem_key),
        FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
    )
    """)
    
    # Stories table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id INTEGER,
        title TEXT,
        content_text TEXT,
        moral_lesson TEXT,
        daily_task TEXT,
        problem_key TEXT,
        audio_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (child_id) REFERENCES children (id)
    )
    """)
    
    # Tasks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        child_id INTEGER,
        task_name TEXT,
        problem_key TEXT,
        is_completed INTEGER DEFAULT 0,
        task_date TEXT,
        FOREIGN KEY (child_id) REFERENCES children (id)
    )
    """)
    
    # Voice samples table to track voice cloning progress
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS voice_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        role TEXT,
        file_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    conn.commit()
    
    # Check if problem_key column exists in stories table, if not add it
    cursor.execute("PRAGMA table_info(stories)")
    columns = [col[1] for col in cursor.fetchall()]
    if columns and "problem_key" not in columns:
        cursor.execute("ALTER TABLE stories ADD COLUMN problem_key TEXT")
        conn.commit()
        
    # Check if mother_name and father_name columns exist in users table, if not add them
    cursor.execute("PRAGMA table_info(users)")
    user_columns = [col[1] for col in cursor.fetchall()]
    if user_columns and "mother_name" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN mother_name TEXT")
        conn.commit()
    if user_columns and "father_name" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN father_name TEXT")
        conn.commit()
        
    conn.close()

def get_user(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def create_user(telegram_id, username, full_name, referred_by=None):
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if user already exists
    existing = get_user(telegram_id)
    if existing:
        conn.close()
        return existing
        
    # Generate a simple referral code
    referral_code = f"ref_{telegram_id}"
    
    # Parse referred_by if it's a string code
    ref_id = None
    if referred_by:
        try:
            if isinstance(referred_by, str) and referred_by.startswith("ref_"):
                ref_id = int(referred_by.replace("ref_", ""))
            else:
                ref_id = int(referred_by)
        except Exception:
            ref_id = None

    try:
        cursor.execute("""
        INSERT INTO users (telegram_id, username, full_name, referred_by, referral_code, bonus_tokens)
        VALUES (?, ?, ?, ?, ?, 3)
        """, (telegram_id, username, full_name, ref_id, referral_code))
        
        # Award bonus tokens to referrer
        if ref_id:
            cursor.execute("""
            UPDATE users SET bonus_tokens = bonus_tokens + 1 WHERE telegram_id = ?
            """, (ref_id,))
            
        conn.commit()
    except sqlite3.IntegrityError:
        pass
        
    conn.close()
    return get_user(telegram_id)

def get_child_profile(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM children WHERE user_id = ?", (telegram_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    child = dict(row)
    # Fetch problems
    cursor.execute("SELECT problem_key FROM child_problems WHERE child_id = ?", (child['id'],))
    child['problems'] = [r['problem_key'] for r in cursor.fetchall()]
    conn.close()
    return child

def save_child_profile(telegram_id, name, age, favorite_hero, favorite_animal, favorite_toy, boy_friend_name, girl_friend_name, problems, mother_name=None, father_name=None):
    conn = get_db()
    cursor = conn.cursor()
    
    # Update parent names in users table if provided
    if mother_name or father_name:
        cursor.execute("SELECT mother_name, father_name, full_name FROM users WHERE telegram_id = ?", (telegram_id,))
        user_row = cursor.fetchone()
        
        if not user_row:
            # Create user in database first
            full_name = ""
            if mother_name and father_name:
                full_name = f"{mother_name} & {father_name}"
            elif mother_name:
                full_name = mother_name
            elif father_name:
                full_name = father_name
                
            cursor.execute("""
            INSERT INTO users (telegram_id, username, full_name, mother_name, father_name, bonus_tokens)
            VALUES (?, ?, ?, ?, ?, 3)
            """, (telegram_id, f"user_{telegram_id}", full_name, mother_name, father_name))
            
            curr_m = mother_name
            curr_f = father_name
        else:
            curr_m = mother_name if mother_name else user_row['mother_name']
            curr_f = father_name if father_name else user_row['father_name']
            
            full_name = ""
            if curr_m and curr_f:
                full_name = f"{curr_m} & {curr_f}"
            elif curr_m:
                full_name = curr_m
            elif curr_f:
                full_name = curr_f
                
            cursor.execute("""
            UPDATE users 
            SET mother_name = ?, father_name = ?, full_name = ?
            WHERE telegram_id = ?
            """, (curr_m, curr_f, full_name, telegram_id))
    
    # Check if user has child profile already
    cursor.execute("SELECT id FROM children WHERE user_id = ?", (telegram_id,))
    row = cursor.fetchone()
    
    if row:
        child_id = row['id']
        cursor.execute("""
        UPDATE children 
        SET name = ?, age = ?, favorite_hero = ?, favorite_animal = ?, favorite_toy = ?, boy_friend_name = ?, girl_friend_name = ?
        WHERE id = ?
        """, (name, age, favorite_hero, favorite_animal, favorite_toy, boy_friend_name, girl_friend_name, child_id))
        
        # Clear old problems
        cursor.execute("DELETE FROM child_problems WHERE child_id = ?", (child_id,))
    else:
        cursor.execute("""
        INSERT INTO children (user_id, name, age, favorite_hero, favorite_animal, favorite_toy, boy_friend_name, girl_friend_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (telegram_id, name, age, favorite_hero, favorite_animal, favorite_toy, boy_friend_name, girl_friend_name))
        child_id = cursor.lastrowid
        
    # Insert new problems
    for prob in problems:
        cursor.execute("""
        INSERT OR IGNORE INTO child_problems (child_id, problem_key)
        VALUES (?, ?)
        """, (child_id, prob))
        
    conn.commit()
    conn.close()
    return get_child_profile(telegram_id)

def spend_token(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT bonus_tokens, subscription_status FROM users WHERE telegram_id = ?", (telegram_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return False
        
    if row['subscription_status'] in ['weekly', 'monthly']:
        conn.close()
        return True # Unlimited for subscribers
        
    if row['bonus_tokens'] > 0:
        cursor.execute("UPDATE users SET bonus_tokens = bonus_tokens - 1 WHERE telegram_id = ?", (telegram_id,))
        conn.commit()
        conn.close()
        return True
        
    conn.close()
    return False

def save_story(child_id, title, content_text, moral_lesson, daily_task, problem_key=None, audio_url=None):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO stories (child_id, title, content_text, moral_lesson, daily_task, problem_key, audio_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (child_id, title, content_text, moral_lesson, daily_task, problem_key, audio_url))
    story_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return story_id

def get_stories(child_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM stories WHERE child_id = ? ORDER BY created_at DESC", (child_id,))
    rows = cursor.fetchall()
    stories = [dict(r) for r in rows]
    conn.close()
    return stories

def get_daily_tasks(child_id, problems):
    conn = get_db()
    cursor = conn.cursor()
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Fetch existing tasks for today
    cursor.execute("SELECT * FROM tasks WHERE child_id = ? AND task_date = ?", (child_id, today))
    rows = cursor.fetchall()
    
    if rows:
        tasks = [dict(r) for r in rows]
        conn.close()
        return tasks
        
    # If no tasks exist for today, generate new tasks based on problems
    problem_task_mapping = {
        "screentime": "Bugun telefondan foydalanishni 1 soatdan kamaytirish va o'rniga kitob o'qish.",
        "teeth_brush": "Ertalab va kechqurun tishlarni 2 daqiqa davomida yaxshilab yuvish.",
        "food": "Fast-food o'rniga foydali sabzavotli salat yoki meva yeyish.",
        "bedtime": "Kechqurun soat 21:00 da uxlagani yotish va uyqudan oldin telefonga qaramaslik.",
        "behavior": "Bugun uydagilarga yoki do'stlarga nisbatan shirinso'z va muloyim bo'lish."
    }
    
    generated_tasks = []
    # If child has no selected problems, add a default task
    if not problems:
        problems = ["behavior"]
        
    for prob in problems:
        if prob in problem_task_mapping:
            task_name = problem_task_mapping[prob]
            cursor.execute("""
            INSERT INTO tasks (child_id, task_name, problem_key, is_completed, task_date)
            VALUES (?, ?, ?, 0, ?)
            """, (child_id, task_name, prob, today))
            
    conn.commit()
    
    # Retrieve newly inserted tasks
    cursor.execute("SELECT * FROM tasks WHERE child_id = ? AND task_date = ?", (child_id, today))
    tasks = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return tasks

def toggle_task(task_id, is_completed):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE tasks SET is_completed = ? WHERE id = ?", (1 if is_completed else 0, task_id))
    conn.commit()
    conn.close()
    return True

def get_referral_info(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    # Count how many users signed up using this user's telegram_id as referred_by
    cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE referred_by = ?", (telegram_id,))
    count = cursor.fetchone()['cnt']
    conn.close()
    return {
        "referral_code": f"ref_{telegram_id}",
        "invited_count": count
    }

def update_subscription(telegram_id, plan_type):
    # plan_type could be 'weekly', 'monthly', 'free'
    conn = get_db()
    cursor = conn.cursor()
    expires = None
    if plan_type != 'free':
        # Mock expiration (weekly = 7 days, monthly = 30 days)
        from datetime import timedelta
        days = 7 if plan_type == 'weekly' else 30
        expires = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        
    cursor.execute("""
    UPDATE users 
    SET subscription_status = ?, subscription_expires_at = ? 
    WHERE telegram_id = ?
    """, (plan_type, expires, telegram_id))
    conn.commit()
    conn.close()
    return get_user(telegram_id)

def save_voice_sample(telegram_id, role, file_path):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO voice_samples (telegram_id, role, file_path)
    VALUES (?, ?, ?)
    """, (telegram_id, role, file_path))
    conn.commit()
    conn.close()
    return True

def get_voice_samples_count(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT role, COUNT(*) as cnt FROM voice_samples WHERE telegram_id = ? GROUP BY role
    """, (telegram_id,))
    rows = cursor.fetchall()
    conn.close()
    
    result = {"mother": 0, "father": 0}
    for r in rows:
        result[r["role"]] = r["cnt"]
    return result

def delete_voice_samples(telegram_id):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM voice_samples WHERE telegram_id = ?", (telegram_id,))
    conn.commit()
    conn.close()
    return True
