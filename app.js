"use strict";

/*
============================================================
S2 PICK'EM MINI APP
============================================================

Сейчас приложение работает автономно.

Данные сохраняются в localStorage.

Позже можно подключить Python API:
GET  /api/me
GET  /api/tournament
GET  /api/matches
GET  /api/top
GET  /api/stats

POST /api/predictions
POST /api/daily/complete

============================================================
*/


// ============================================================
// TELEGRAM MINI APP
// ============================================================

const tg =
    window.Telegram &&
    window.Telegram.WebApp
        ? window.Telegram.WebApp
        : null;

if (tg) {
    tg.ready();
    tg.expand();

    try {
        tg.setHeaderColor("#080808");
        tg.setBackgroundColor("#080808");
    } catch (e) {
        console.log("Telegram theme API unavailable");
    }
}


// ============================================================
// DEMO DATA
// ============================================================

const defaultState = {

    user: {
        id: null,
        username: "Игрок",
        first_name: "Игрок",
        points: 125
    },

    tournament: {
        id: 1,
        name: "S2 PICK'EM",
        stage: "Групповая стадия"
    },

    matches: [

        {
            id: 1,
            team1: "STORM",
            team2: "ECLIPSE",
            time: "18.08 • 20:00",
            status: "pending"
        },

        {
            id: 2,
            team1: "RAVENS",
            team2: "NOVA",
            time: "18.08 • 21:30",
            status: "pending"
        },

        {
            id: 3,
            team1: "PHANTOMS",
            team2: "WOLVES",
            time: "19.08 • 18:00",
            status: "pending"
        }

    ],

    predictions: [],

    daily: {
        id: 1,
        title: "Ежедневное задание",
        description: "Выполни задание и получи дополнительные очки.",
        points: 25,
        completed: false
    },

    leaderboard: [

        {
            username: "s1mple",
            points: 820,
            correct: 24,
            total: 28
        },

        {
            username: "donk",
            points: 735,
            correct: 22,
            total: 27
        },

        {
            username: "m0NESY",
            points: 680,
            correct: 21,
            total: 27
        },

        {
            username: "player",
            points: 510,
            correct: 16,
            total: 22
        },

        {
            username: "shadow",
            points: 445,
            correct: 14,
            total: 20
        },

        {
            username: "hunter",
            points: 390,
            correct: 12,
            total: 19
        }

    ]

};


// ============================================================
// STATE
// ============================================================

let state = loadState();

let currentMatch = null;

let selectedWinner = null;


// ============================================================
// STORAGE
// ============================================================

function loadState() {

    try {

        const saved =
            localStorage.getItem("pickem_state");

        if (!saved) {
            return structuredClone(defaultState);
        }

        const parsed =
            JSON.parse(saved);

        return mergeDeep(
            structuredClone(defaultState),
            parsed
        );

    } catch (error) {

        console.error(
            "State load error:",
            error
        );

        return structuredClone(defaultState);
    }
}


function saveState() {

    try {

        localStorage.setItem(
            "pickem_state",
            JSON.stringify(state)
        );

    } catch (error) {

        console.error(
            "State save error:",
            error
        );
    }
}


function mergeDeep(target, source) {

    if (
        typeof target !== "object" ||
        typeof source !== "object" ||
        target === null ||
        source === null
    ) {
        return source;
    }

    for (const key of Object.keys(source)) {

        if (
            typeof source[key] === "object" &&
            source[key] !== null &&
            !Array.isArray(source[key])
        ) {

            target[key] =
                mergeDeep(
                    target[key] || {},
                    source[key]
                );

        } else {

            target[key] = source[key];
        }
    }

    return target;
}


// ============================================================
// INIT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initNavigation();

        loadTelegramUser();

        renderAll();

    }
);


// ============================================================
// TELEGRAM USER
// ============================================================

function loadTelegramUser() {

    if (
        !tg ||
        !tg.initDataUnsafe ||
        !tg.initDataUnsafe.user
    ) {
        return;
    }

    const user =
        tg.initDataUnsafe.user;

    state.user.id =
        user.id || null;

    state.user.username =
        user.username
            ? `@${user.username}`
            : (
                user.first_name ||
                "Игрок"
            );

    state.user.first_name =
        user.first_name ||
        "Игрок";

    saveState();
}


// ============================================================
// NAVIGATION
// ============================================================

function initNavigation() {

    const buttons =
        document.querySelectorAll(
            ".nav-item"
        );

    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const page =
                        button.dataset.page;

                    openPage(page);

                }
            );

        }
    );
}


function openPage(page) {

    document
        .querySelectorAll(".page")
        .forEach(
            element => {
                element.classList.remove(
                    "active"
                );
            }
        );


    const target =
        document.getElementById(
            `page-${page}`
        );

    if (target) {

        target.classList.add(
            "active"
        );
    }


    document
        .querySelectorAll(".nav-item")
        .forEach(
            button => {

                button.classList.toggle(
                    "active",
                    button.dataset.page === page
                );

            }
        );


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });


    renderPage(page);
}


// ============================================================
// RENDER ALL
// ============================================================

function renderAll() {

    renderHeader();

    renderPickem();

    renderDaily();

    renderLeaderboard();

    renderStats();

}


// ============================================================
// HEADER
// ============================================================

function renderHeader() {

    const points =
        document.getElementById(
            "headerPoints"
        );

    if (points) {
        points.textContent =
            state.user.points;
    }

}


// ============================================================
// PICKEM
// ============================================================

function renderPickem() {

    const tournamentName =
        document.getElementById(
            "tournamentName"
        );

    const tournamentStage =
        document.getElementById(
            "tournamentStage"
        );


    if (tournamentName) {
        tournamentName.textContent =
            state.tournament.name;
    }


    if (tournamentStage) {
        tournamentStage.textContent =
            state.tournament.stage;
    }


    renderProgress();

    renderMatches();

}


// ============================================================
// PROGRESS
// ============================================================

function renderProgress() {

    const maxPoints = 500;

    const points =
        Math.min(
            state.user.points,
            maxPoints
        );

    const percent =
        Math.round(
            (points / maxPoints) * 100
        );


    const text =
        document.getElementById(
            "progressText"
        );

    const bar =
        document.getElementById(
            "progressBar"
        );

    const achievement =
        document.getElementById(
            "achievement"
        );


    if (text) {
        text.textContent =
            `${points} / ${maxPoints}`;
    }


    if (bar) {
        bar.style.width =
            `${percent}%`;
    }


    let tier = "BEGINNER";

    if (state.user.points >= 500) {
        tier = "GOD";
    } else if (state.user.points >= 350) {
        tier = "CHEATER";
    } else if (state.user.points >= 200) {
        tier = "PRO";
    }


    if (achievement) {
        achievement.textContent =
            tier;
    }

}


// ============================================================
// MATCHES
// ============================================================

function renderMatches() {

    const container =
        document.getElementById(
            "matches"
        );

    const counter =
        document.getElementById(
            "matchCount"
        );


    if (!container) {
        return;
    }


    const availableMatches =
        state.matches.filter(
            match => {

                return (
                    match.status === "pending" &&
                    !hasPrediction(match.id)
                );

            }
        );


    if (counter) {

        counter.textContent =
            availableMatches.length;

    }


    if (!availableMatches.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div style="font-size:30px;margin-bottom:10px">
                    🎯
                </div>

                Все доступные матчи уже предсказаны.
                <br><br>
                Загляни позже!
            </div>
        `;

        return;
    }


    container.innerHTML =
        availableMatches
            .map(
                match => {

                    return `
                        <div class="match-card">

                            <div class="match-top">

                                <span>
                                    MATCH #${match.id}
                                </span>

                                <span class="match-time">
                                    ${escapeHtml(match.time || "Время неизвестно")}
                                </span>

                            </div>

                            <div class="match-teams">

                                <div class="team">
                                    ${escapeHtml(match.team1)}
                                </div>

                                <div class="vs">
                                    VS
                                </div>

                                <div class="team">
                                    ${escapeHtml(match.team2)}
                                </div>

                            </div>

                            <button
                                class="predict-button"
                                onclick="openPrediction(${match.id})"
                            >
                                🔮 СДЕЛАТЬ ПРОГНОЗ
                            </button>

                        </div>
                    `;

                }
            )
            .join("");

}


// ============================================================
// PREDICTION
// ============================================================

function openPrediction(matchId) {

    currentMatch =
        state.matches.find(
            match =>
                match.id === matchId
        );


    if (!currentMatch) {
        showToast(
            "Матч не найден"
        );

        return;
    }


    selectedWinner = null;


    document.getElementById(
        "modalMatchTitle"
    ).textContent =
        `${currentMatch.team1} vs ${currentMatch.team2}`;


    document.getElementById(
        "team1Button"
    ).textContent =
        currentMatch.team1;


    document.getElementById(
        "team2Button"
    ).textContent =
        currentMatch.team2;


    document
        .getElementById("team1Button")
        .classList.remove("selected");


    document
        .getElementById("team2Button")
        .classList.remove("selected");


    document.getElementById(
        "score1"
    ).value = "";


    document.getElementById(
        "score2"
    ).value = "";


    document.getElementById(
        "mvpInput"
    ).value = "";


    document
        .getElementById(
            "predictionModal"
        )
        .classList.remove("hidden");


    document.body.style.overflow =
        "hidden";

}


function closePrediction() {

    document
        .getElementById(
            "predictionModal"
        )
        .classList.add("hidden");


    document.body.style.overflow =
        "";

}


function selectWinner(which) {

    if (!currentMatch) {
        return;
    }


    selectedWinner =
        which === 1
            ? currentMatch.team1
            : currentMatch.team2;


    document
        .getElementById("team1Button")
        .classList.toggle(
            "selected",
            which === 1
        );


    document
        .getElementById("team2Button")
        .classList.toggle(
            "selected",
            which === 2
        );

}


function submitPrediction() {

    if (!currentMatch) {
        return;
    }


    if (!selectedWinner) {

        showToast(
            "Выбери победителя"
        );

        return;
    }


    const score1 =
        Number(
            document.getElementById(
                "score1"
            ).value
        );


    const score2 =
        Number(
            document.getElementById(
                "score2"
            ).value
        );


    if (
        Number.isNaN(score1) ||
        Number.isNaN(score2) ||
        score1 < 0 ||
        score2 < 0
    ) {

        showToast(
            "Укажи правильный счёт"
        );

        return;
    }


    const mvp =
        document
            .getElementById(
                "mvpInput"
            )
            .value
            .trim();


    if (!mvp) {

        showToast(
            "Укажи MVP"
        );

        return;
    }


    if (
        hasPrediction(
            currentMatch.id
        )
    ) {

        showToast(
            "Ты уже сделал прогноз"
        );

        closePrediction();

        return;
    }


    const prediction = {

        id:
            Date.now(),

        match_id:
            currentMatch.id,

        winner:
            selectedWinner,

        score1:
            score1,

        score2:
            score2,

        mvp:
            mvp,

        created_at:
            new Date().toISOString()

    };


    state.predictions.push(
        prediction
    );


    saveState();

    closePrediction();

    renderAll();

    showToast(
        "✅ Прогноз сохранён!"
    );


    /*
    ========================================================
    ЗДЕСЬ ПОЗЖЕ БУДЕТ API:

    apiRequest(
        "/api/predictions",
        {
            method: "POST",
            body: JSON.stringify(prediction)
        }
    );

    ========================================================
    */

}


// ============================================================
// CHECK PREDICTION
// ============================================================

function hasPrediction(matchId) {

    return state.predictions.some(
        prediction =>
            prediction.match_id === matchId
    );

}


// ============================================================
// DAILY
// ============================================================

function renderDaily() {

    const daily =
        state.daily;


    const title =
        document.getElementById(
            "dailyTitle"
        );

    const description =
        document.getElementById(
            "dailyDescription"
        );

    const reward =
        document.getElementById(
            "dailyReward"
        );

    const button =
        document.getElementById(
            "dailyButton"
        );


    if (title) {
        title.textContent =
            daily.title;
    }


    if (description) {
        description.textContent =
            daily.description;
    }


    if (reward) {
        reward.textContent =
            `+${daily.points} PTS`;
    }


    if (button) {

        if (daily.completed) {

            button.textContent =
                "✅ ЗАДАНИЕ ВЫПОЛНЕНО";

            button.disabled =
                true;

        } else {

            button.textContent =
                "✅ ВЫПОЛНИТЬ ЗАДАНИЕ";

            button.disabled =
                false;

        }

    }

}


function completeDaily() {

    if (state.daily.completed) {

        showToast(
            "Задание уже выполнено"
        );

        return;
    }


    state.daily.completed =
        true;


    state.user.points +=
        state.daily.points;


    saveState();

    renderAll();

    showToast(
        `⚡ +${state.daily.points} pts`
    );


    /*
    ========================================================
    ПОЗЖЕ:

    POST /api/daily/complete

    ========================================================
    */

}


// ============================================================
// LEADERBOARD
// ============================================================

function renderLeaderboard() {

    const container =
        document.getElementById(
            "leaderboard"
        );


    if (!container) {
        return;
    }


    const users = [
        ...state.leaderboard
    ];


    /*
    Добавляем текущего пользователя
    в демонстрационный рейтинг.
    */

    const currentUser =
        users.find(
            user =>
                user.username ===
                state.user.username
        );


    if (!currentUser) {

        users.push({

            username:
                state.user.username,

            points:
                state.user.points,

            correct:
                getCorrectPredictions(),

            total:
                state.predictions.length

        });

    }


    users.sort(
        (a, b) =>
            b.points - a.points
    );


    container.innerHTML =
        users
            .slice(0, 10)
            .map(
                (user, index) => {

                    const accuracy =
                        user.total
                            ? Math.round(
                                (user.correct /
                                    user.total) *
                                    100
                            )
                            : 0;


                    const medal =
                        index === 0
                            ? "🥇"
                            : index === 1
                            ? "🥈"
                            : index === 2
                            ? "🥉"
                            : `${index + 1}.`;


                    const firstLetter =
                        (
                            user.username ||
                            "P"
                        )
                            .replace("@", "")
                            .charAt(0)
                            .toUpperCase();


                    return `
                        <div class="leader-row">

                            <div class="leader-position">
                                ${medal}
                            </div>

                            <div class="leader-avatar">
                                ${escapeHtml(firstLetter)}
                            </div>

                            <div class="leader-info">

                                <div class="leader-name">
                                    ${escapeHtml(user.username)}
                                </div>

                                <div class="leader-correct">
                                    ${user.correct}/${user.total}
                                    верных · ${accuracy}%
                                </div>

                            </div>

                            <div class="leader-points">
                                ${user.points}
                            </div>

                        </div>
                    `;

                }
            )
            .join("");

}


// ============================================================
// STATS
// ============================================================

function renderStats() {

    const total =
        state.predictions.length;


    const correct =
        getCorrectPredictions();


    const accuracy =
        total
            ? Math.round(
                (correct / total) * 100
            )
            : 0;


    setText(
        "statPoints",
        state.user.points
    );

    setText(
        "statAccuracy",
        `${accuracy}%`
    );

    setText(
        "statPredictions",
        total
    );

    setText(
        "statCorrect",
        correct
    );


    setText(
        "profileName",
        state.user.username ||
        state.user.first_name ||
        "Игрок"
    );


    const name =
        state.user.username ||
        state.user.first_name ||
        "P";


    setText(
        "avatarLetter",
        name
            .replace("@", "")
            .charAt(0)
            .toUpperCase()
    );

}


function getCorrectPredictions() {

    /*
    В демонстрационной версии
    прогнозы ещё не имеют результатов
    матчей.

    После подключения API здесь
    будут реальные scored / points_earned.
    */

    return state.predictions.filter(
        prediction =>
            prediction.correct === true
    ).length;

}


// ============================================================
// RENDER CURRENT PAGE
// ============================================================

function renderPage(page) {

    switch (page) {

        case "pickem":
            renderPickem();
            break;

        case "daily":
            renderDaily();
            break;

        case "top":
            renderLeaderboard();
            break;

        case "stats":
            renderStats();
            break;

    }

}


// ============================================================
// TOAST
// ============================================================

let toastTimer = null;


function showToast(message) {

    const toast =
        document.getElementById(
            "toast"
        );

    const text =
        document.getElementById(
            "toastText"
        );


    if (!toast || !text) {
        return;
    }


    text.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toastTimer
    );


    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2500
        );

}


// ============================================================
// HELPERS
// ============================================================

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent =
            value;
    }

}


function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ============================================================
// API READY LAYER
// ============================================================

/*
Когда появится сервер, можно переключить приложение
с localStorage на API.

Пример:

const API_URL = "https://api.example.ru";

async function apiRequest(endpoint, options = {}) {

    const response = await fetch(
        `${API_URL}${endpoint}`,
        {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `API error: ${response.status}`
        );
    }

    return response.json();
}

*/


// ============================================================
// TELEGRAM MAIN BUTTON
// ============================================================

if (tg) {

    try {

        tg.MainButton.hide();

    } catch (e) {
        console.log(
            "MainButton unavailable"
        );
    }

}
