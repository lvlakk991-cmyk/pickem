import os
import json
import hmac
import hashlib
import datetime as dt
from urllib.parse import parse_qsl

import aiosqlite

from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database as db

from config import (
    BOT_TOKEN,
    ADMIN_IDS,
    DB_PATH,
    POINTS_WINNER,
    POINTS_SCORE,
    POINTS_MVP,
)


app = FastAPI(
    title="ASCEND PICKEM API",
    version="1.0.0"
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://lvlakk991-cmyk.github.io",
        "http://localhost",
        "http://127.0.0.1",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# MODELS
# ---------------------------------------------------------

class TournamentCreate(BaseModel):
    name: str
    stage: str = "Групповая стадия"


class MatchCreate(BaseModel):
    tournament_id: int
    team1: str
    team2: str
    match_time: str | None = None


class PredictionCreate(BaseModel):
    match_id: int
    winner: str
    score1: int
    score2: int
    mvp: str


class ResultCreate(BaseModel):
    winner: str
    score1: int
    score2: int
    mvp: str


class DailyCreate(BaseModel):
    description: str
    points: int


# ---------------------------------------------------------
# TELEGRAM MINI APP AUTH
# ---------------------------------------------------------

def validate_init_data(init_data: str) -> dict:
    """
    Проверяет Telegram WebApp initData.

    Telegram подписывает строку:
        data-check-string

    Секретный ключ:
        HMAC-SHA256("WebAppData", BOT_TOKEN)
    """

    if not init_data:
        raise HTTPException(
            status_code=401,
            detail="Telegram initData отсутствует"
        )

    try:
        pairs = dict(parse_qsl(
            init_data,
            keep_blank_values=True
        ))
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Некорректный initData"
        )

    received_hash = pairs.pop("hash", None)

    if not received_hash:
        raise HTTPException(
            status_code=401,
            detail="Hash отсутствует"
        )

    data_check_string = "\n".join(
        f"{key}={value}"
        for key, value in sorted(pairs.items())
    )

    secret_key = hmac.new(
        b"WebAppData",
        BOT_TOKEN.encode(),
        hashlib.sha256
    ).digest()

    calculated_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(
        calculated_hash,
        received_hash
    ):
        raise HTTPException(
            status_code=401,
            detail="Неверная подпись Telegram"
        )

    # user
    user_json = pairs.get("user")

    if not user_json:
        raise HTTPException(
            status_code=401,
            detail="Telegram user отсутствует"
        )

    try:
        user = json.loads(user_json)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Некорректные данные пользователя"
        )

    return user


async def get_current_user(
    x_telegram_init_data: str | None
) -> dict:

    if not x_telegram_init_data:
        raise HTTPException(
            status_code=401,
            detail="Открой Mini App через Telegram"
        )

    tg_user = validate_init_data(
        x_telegram_init_data
    )

    tg_id = int(tg_user["id"])

    user = await db.get_or_create_user(
        tg_id,
        tg_user.get("username")
    )

    user["telegram_user"] = tg_user

    user["is_admin"] = (
        tg_id in ADMIN_IDS
    )

    return user


async def require_admin(
    x_telegram_init_data: str | None
) -> dict:

    user = await get_current_user(
        x_telegram_init_data
    )

    if not user["is_admin"]:

        raise HTTPException(
            status_code=403,
            detail="Нет доступа к админ-панели"
        )

    return user


# ---------------------------------------------------------
# BASIC
# ---------------------------------------------------------

@app.get("/")
async def root():

    return {
        "ok": True,
        "service": "ASCEND PICKEM API"
    }


@app.get("/api/me")
async def me(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    return {
        "id": user["id"],
        "tg_id": user["tg_id"],
        "username": user["username"],
        "points": user["points"],
        "is_admin": user["is_admin"],
    }


# ---------------------------------------------------------
# PICKEM
# ---------------------------------------------------------

@app.get("/api/pickem")
async def pickem(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    tournament = await db.get_active_tournament()

    if not tournament:

        return {
            "tournament": None,
            "matches": []
        }


    matches = await db.get_pending_matches(
        tournament["id"]
    )


    available = []

    for match in matches:

        predicted = await db.has_predicted(
            user["id"],
            match["id"]
        )

        if not predicted:
            available.append(match)


    return {
        "tournament": tournament,
        "matches": available
    }


# ---------------------------------------------------------
# MATCH
# ---------------------------------------------------------

@app.get("/api/matches/{match_id}")
async def get_match(
    match_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await get_current_user(
        x_telegram_init_data
    )

    match = await db.get_match(
        match_id
    )

    if not match:

        raise HTTPException(
            status_code=404,
            detail="Матч не найден"
        )

    return match


# ---------------------------------------------------------
# PREDICTION
# ---------------------------------------------------------

@app.post("/api/predictions")
async def create_prediction(
    payload: PredictionCreate,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    match = await db.get_match(
        payload.match_id
    )

    if not match:

        raise HTTPException(
            status_code=404,
            detail="Матч не найден"
        )


    if match["status"] != "pending":

        raise HTTPException(
            status_code=400,
            detail="Матч уже завершён"
        )


    if await db.has_predicted(
        user["id"],
        payload.match_id
    ):

        raise HTTPException(
            status_code=400,
            detail="Вы уже сделали прогноз"
        )


    if payload.winner not in (
        match["team1"],
        match["team2"]
    ):

        raise HTTPException(
            status_code=400,
            detail="Неверный победитель"
        )


    if payload.score1 < 0 or payload.score2 < 0:

        raise HTTPException(
            status_code=400,
            detail="Некорректный счёт"
        )


    if not payload.mvp.strip():

        raise HTTPException(
            status_code=400,
            detail="Укажи MVP"
        )


    await db.add_prediction(
        user_id=user["id"],
        match_id=payload.match_id,
        winner=payload.winner,
        score1=payload.score1,
        score2=payload.score2,
        mvp=payload.mvp.strip()
    )


    return {
        "ok": True,
        "message": "Предсказание сохранено"
    }


# ---------------------------------------------------------
# DAILY
# ---------------------------------------------------------

@app.get("/api/daily")
async def daily(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    task = await db.get_today_task()

    if not task:

        return {
            "task": None
        }


    completed = await db.has_completed_task(
        user["id"],
        task["id"]
    )


    return {
        "task": {
            **task,
            "completed": completed
        }
    }


@app.post("/api/daily/{task_id}/complete")
async def complete_daily(
    task_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    task = None

    tasks = await db.list_daily_tasks(
        limit=100
    )

    for item in tasks:

        if item["id"] == task_id:
            task = item
            break


    if not task:

        raise HTTPException(
            status_code=404,
            detail="Задание не найдено"
        )


    if task["task_date"] != dt.date.today().isoformat():

        raise HTTPException(
            status_code=400,
            detail="Это задание уже не актуально"
        )


    if await db.has_completed_task(
        user["id"],
        task_id
    ):

        raise HTTPException(
            status_code=400,
            detail="Задание уже выполнено"
        )


    await db.complete_task(
        user["id"],
        task_id,
        task["points"]
    )


    return {
        "ok": True,
        "points": task["points"]
    }


# ---------------------------------------------------------
# TOP
# ---------------------------------------------------------

@app.get("/api/top")
async def top(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await get_current_user(
        x_telegram_init_data
    )

    users = await db.get_top_users(
        10
    )

    return {
        "users": users
    }


# ---------------------------------------------------------
# STATS
# ---------------------------------------------------------

@app.get("/api/stats")
async def stats(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    user = await get_current_user(
        x_telegram_init_data
    )

    data = await db.get_user_prediction_stats(
        user["id"]
    )

    total = data["total"]
    correct = data["correct"]

    accuracy = (
        int(correct * 100 / total)
        if total
        else 0
    )


    return {
        "points": user["points"],
        "total": total,
        "correct": correct,
        "accuracy": accuracy
    }


# =========================================================
# ADMIN
# =========================================================

@app.get("/api/admin/dashboard")
async def admin_dashboard(
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    tournaments = await db.list_tournaments()


    async with aiosqlite.connect(DB_PATH) as database:

        database.row_factory = aiosqlite.Row


        cursor = await database.execute(
            """
            SELECT
                m.*,
                t.name AS tournament_name
            FROM matches m
            LEFT JOIN tournaments t
                ON t.id = m.tournament_id
            ORDER BY m.id DESC
            """
        )

        matches = [
            dict(row)
            for row in await cursor.fetchall()
        ]


    daily_tasks = await db.list_daily_tasks(
        100
    )


    return {
        "tournaments": tournaments,
        "matches": matches,
        "daily_tasks": daily_tasks
    }


# ---------------------------------------------------------
# ADMIN TOURNAMENTS
# ---------------------------------------------------------

@app.post("/api/admin/tournaments")
async def admin_create_tournament(
    payload: TournamentCreate,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    name = payload.name.strip()
    stage = payload.stage.strip()


    if not name:

        raise HTTPException(
            status_code=400,
            detail="Название турнира обязательно"
        )


    tournament_id = await db.create_tournament(
        name,
        stage or "Групповая стадия"
    )


    # Новый турнир автоматически становится активным.
    await db.set_active_tournament(
        tournament_id
    )


    return {
        "ok": True,
        "id": tournament_id
    }


@app.post("/api/admin/tournaments/{tournament_id}/activate")
async def admin_activate_tournament(
    tournament_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    tournaments = await db.list_tournaments()

    exists = any(
        t["id"] == tournament_id
        for t in tournaments
    )

    if not exists:

        raise HTTPException(
            status_code=404,
            detail="Турнир не найден"
        )


    await db.set_active_tournament(
        tournament_id
    )


    return {
        "ok": True
    }


@app.post("/api/admin/tournaments/{tournament_id}/finish")
async def admin_finish_tournament(
    tournament_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    tournaments = await db.list_tournaments()

    exists = any(
        t["id"] == tournament_id
        for t in tournaments
    )

    if not exists:

        raise HTTPException(
            status_code=404,
            detail="Турнир не найден"
        )


    await db.finish_tournament(
        tournament_id
    )


    return {
        "ok": True
    }


# ---------------------------------------------------------
# ADMIN MATCHES
# ---------------------------------------------------------

@app.post("/api/admin/matches")
async def admin_create_match(
    payload: MatchCreate,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    if not payload.team1.strip():
        raise HTTPException(
            status_code=400,
            detail="Команда 1 обязательна"
        )

    if not payload.team2.strip():
        raise HTTPException(
            status_code=400,
            detail="Команда 2 обязательна"
        )


    tournament = await db.get_active_tournament()

    if not tournament:

        raise HTTPException(
            status_code=400,
            detail="Нет активного турнира"
        )


    # Разрешаем создавать матч только в существующем турнире.
    tournaments = await db.list_tournaments()

    exists = any(
        t["id"] == payload.tournament_id
        for t in tournaments
    )

    if not exists:

        raise HTTPException(
            status_code=404,
            detail="Турнир не найден"
        )


    match_id = await db.add_match(
        payload.tournament_id,
        payload.team1.strip(),
        payload.team2.strip(),
        payload.match_time.strip()
        if payload.match_time
        else None
    )


    return {
        "ok": True,
        "id": match_id
    }


@app.delete("/api/admin/matches/{match_id}")
async def admin_delete_match(
    match_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    match = await db.get_match(
        match_id
    )

    if not match:

        raise HTTPException(
            status_code=404,
            detail="Матч не найден"
        )


    async with aiosqlite.connect(DB_PATH) as database:

        await database.execute(
            "DELETE FROM predictions WHERE match_id=?",
            (match_id,)
        )

        await database.execute(
            "DELETE FROM matches WHERE id=?",
            (match_id,)
        )

        await database.commit()


    return {
        "ok": True
    }


# ---------------------------------------------------------
# ADMIN RESULT
# ---------------------------------------------------------

@app.post("/api/admin/matches/{match_id}/result")
async def admin_set_result(
    match_id: int,
    payload: ResultCreate,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    match = await db.get_match(
        match_id
    )

    if not match:

        raise HTTPException(
            status_code=404,
            detail="Матч не найден"
        )


    if match["status"] != "pending":

        raise HTTPException(
            status_code=400,
            detail="Результат этого матча уже внесён"
        )


    if payload.winner not in (
        match["team1"],
        match["team2"]
    ):

        raise HTTPException(
            status_code=400,
            detail="Неверный победитель"
        )


    if payload.score1 < 0 or payload.score2 < 0:

        raise HTTPException(
            status_code=400,
            detail="Неверный счёт"
        )


    if not payload.mvp.strip():

        raise HTTPException(
            status_code=400,
            detail="MVP обязателен"
        )


    await db.set_match_result(
        match_id,
        payload.winner,
        payload.score1,
        payload.score2,
        payload.mvp.strip()
    )


    return {
        "ok": True
    }


# ---------------------------------------------------------
# ADMIN DAILY
# ---------------------------------------------------------

@app.post("/api/admin/daily")
async def admin_create_daily(
    payload: DailyCreate,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    description = payload.description.strip()


    if not description:

        raise HTTPException(
            status_code=400,
            detail="Текст задания обязателен"
        )


    if payload.points <= 0:

        raise HTTPException(
            status_code=400,
            detail="Очки должны быть больше 0"
        )


    today = dt.date.today().isoformat()


    task_id = await db.add_daily_task(
        today,
        description,
        payload.points
    )


    return {
        "ok": True,
        "id": task_id
    }


@app.delete("/api/admin/daily/{task_id}")
async def admin_delete_daily(
    task_id: int,
    x_telegram_init_data: str | None = Header(
        default=None
    )
):

    await require_admin(
        x_telegram_init_data
    )


    tasks = await db.list_daily_tasks(
        100
    )

    exists = any(
        t["id"] == task_id
        for t in tasks
    )

    if not exists:

        raise HTTPException(
            status_code=404,
            detail="Задание не найдено"
        )


    await db.delete_daily_task(
        task_id
    )


    return {
        "ok": True
    }
