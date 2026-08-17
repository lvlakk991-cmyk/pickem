import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
ADMIN_IDS = {
    int(x) for x in os.getenv("ADMIN_IDS", "").replace(" ", "").split(",") if x
}
DB_PATH = os.getenv("DB_PATH", "pickem.db")

# --- Points system (matches the "Победитель / Счёт / MVP" rules) ---
POINTS_WINNER = 10
POINTS_SCORE = 15
POINTS_MVP = 20

# Bonus points for subscribing to all partner channels
SUBSCRIBE_BONUS = 100

# --- Achievement tiers (progress bar in Pick'em) ---
ACHIEVEMENT_TIERS = [
    ("BEGINNER", 150),
    ("PRO", 200),
    ("CHEATER", 350),
    ("GOD", 500),
]
MAX_TIER_POINTS = ACHIEVEMENT_TIERS[-1][1]
