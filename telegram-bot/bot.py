from telebot.types import ReplyKeyboardMarkup, KeyboardButton, Update
from flask import Flask, request
import telebot
import os

TOKEN = "8865315152:AAFZ65EzM8wW62SHqtZy4GYHqAEkU5jHuWA"
bot = telebot.TeleBot(TOKEN)
app = Flask(__name__)

def menu():
    m = ReplyKeyboardMarkup(resize_keyboard=True)
    m.add(KeyboardButton("👶 Bola yoshi maslahat"))
    m.add(KeyboardButton("🍼 Ovqatlanish"), KeyboardButton("💊 Dori eslatma"))
    m.add(KeyboardButton("👩‍⚕️ Shifokor topish"), KeyboardButton("📊 Rivojlanish"))
    return m

@bot.message_handler(commands=["start"])
def start(message):
    bot.send_message(message.chat.id,
        "👶 Assalomu alaykum!\nOna & Bola botiga xush kelibsiz!",
        reply_markup=menu())

@bot.message_handler(func=lambda m: m.text == "👶 Bola yoshi maslahat")
def yosh(message):
    bot.send_message(message.chat.id, "Bolangiz necha oylik?\n1️⃣ 0-3 oy\n2️⃣ 3-6 oy\n3️⃣ 6-12 oy\n4️⃣ 1 yoshdan katta")

@bot.message_handler(func=lambda m: m.text == "🍼 Ovqatlanish")
def ovqat(message):
    bot.send_message(message.chat.id, "🍼 Ovqatlanish bo'limi tez orada!")

@bot.message_handler(func=lambda m: m.text == "👩‍⚕️ Shifokor topish")
def shifokor(message):
    bot.send_message(message.chat.id, "👩‍⚕️ Shifokor qidirish tez orada!")

@bot.message_handler(func=lambda m: m.text == "💊 Dori eslatma")
def dori(message):
    bot.send_message(message.chat.id, "💊 Dori eslatma bo'limi tez orada!")

@bot.message_handler(func=lambda m: m.text == "📊 Rivojlanish")
def rivojlanish(message):
    bot.send_message(message.chat.id, "📊 Rivojlanish bo'limi tez orada!")

@app.route(f"/{TOKEN}", methods=["POST"])
def webhook():
    json_data = request.get_json()
    update = Update.de_json(json_data)
    bot.process_new_updates([update])
    return "OK", 200

@app.route("/")
def index():
    return "Ona & Bola bot ishlayapti!", 200
