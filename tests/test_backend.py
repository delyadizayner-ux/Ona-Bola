import unittest
import os
import sys

# Add root folder to path so we can import db and story_generator
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db
import story_generator

class TestOnaBolaBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Initialize database
        db.init_db()
        
        # Clean up test users to ensure a fresh test run
        conn = db.get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM child_problems WHERE child_id IN (SELECT id FROM children WHERE user_id IN (999111, 999999))")
        cursor.execute("DELETE FROM children WHERE user_id IN (999111, 999999)")
        cursor.execute("DELETE FROM users WHERE telegram_id IN (999111, 999999)")
        conn.commit()
        conn.close()

    def test_user_creation(self):
        telegram_id = 999111
        user = db.create_user(telegram_id, "test_mom", "Test Mom")
        self.assertIsNotNone(user)
        self.assertEqual(user["telegram_id"], telegram_id)
        self.assertEqual(user["username"], "test_mom")
        self.assertEqual(user["bonus_tokens"], 3)

    def test_child_profile(self):
        telegram_id = 999111
        name = "Kichkintoy"
        age = 5
        problems = ["screentime", "teeth_brush"]
        
        child = db.save_child_profile(
            telegram_id, name, age, "Mickey", "Cat", "Ball", "Ali", "Zahra", problems
        )
        self.assertIsNotNone(child)
        self.assertEqual(child["name"], name)
        self.assertEqual(child["age"], age)
        self.assertIn("screentime", child["problems"])
        
        # Verify get_child_profile
        fetched = db.get_child_profile(telegram_id)
        self.assertEqual(fetched["id"], child["id"])

    def test_offline_story_generation(self):
        child = {
            "name": "Ali",
            "age": 4,
            "favorite_hero": "Spiderman",
            "favorite_animal": "Panda",
            "favorite_toy": "Robot",
            "boy_friend_name": "Umar",
            "girl_friend_name": "Maryam"
        }
        
        story = story_generator.generate_personalized_story_offline(child, "screentime")
        self.assertIsNotNone(story)
        self.assertIn("Ali", story["story"])
        self.assertIn("Spiderman", story["story"])
        self.assertIn("Panda", story["story"])
        self.assertIn("Robot", story["story"])
        
    def test_daily_tasks(self):
        telegram_id = 999111
        child = db.get_child_profile(telegram_id)
        
        tasks = db.get_daily_tasks(child["id"], child["problems"])
        self.assertTrue(len(tasks) > 0)
        
        task_id = tasks[0]["id"]
        # Toggle task
        db.toggle_task(task_id, True)
        
        # Refresh and check
        updated_tasks = db.get_daily_tasks(child["id"], child["problems"])
        matching_task = next(t for t in updated_tasks if t["id"] == task_id)
        self.assertEqual(matching_task["is_completed"], 1)

if __name__ == "__main__":
    unittest.main()
