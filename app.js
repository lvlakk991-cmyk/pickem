const tg = window.Telegram?.WebApp;

if (tg) {
    tg.ready();
    tg.expand();

    try {
        tg.setHeaderColor("#080808");
        tg.setBackgroundColor("#080808");
    } catch (e) {}
}


/*
|--------------------------------------------------------------------------
| API
|--------------------------------------------------------------------------
|
| После размещения api.py поменяй:
|
| const API_URL = "https://your-api-domain.com";
|
*/

const API_URL = "YOUR_API_URL";


let currentUser = null;
let currentMatch = null;
let selectedWinner = null;


/*
|--------------------------------------------------------------------------
| API REQUEST
|--------------------------------------------------------------------------
*/

async function api(path, options = {}) {

    const headers = {
        "Content-Type": "application/json"
    };

    if (tg?.initData) {
        headers["X-Telegram-Init-Data"] = tg.initData;
    }

    const response = await fetch(API_URL + path, {
        ...options,
        headers: {
            ...headers,
            ...(options.headers || {})
        }
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("API вернул некорректный ответ");
    }

    if (!response.ok) {
        throw new Error(data.detail || data.error || "Ошибка API");
    }

    return data;
}


/*
|--------------------------------------------------------------------------
| INIT
|--------------------------------------------------------------------------
*/

document.addEventListener("DOMContentLoaded", async () => {

    try {

        if (!API_URL || API_URL === "YOUR_API_URL") {

            showDemoMode();

            return;
        }

        await loadUser();
        await loadPickem();
        await loadDaily();
        await loadTop();
        await loadStats();

        if (currentUser?.is_admin) {
            document
                .getElementById("adminNav")
                .classList.remove("hidden");
        }

        hideLoading();

    } catch (error) {

        console.error(error);

        showToast(error.message || "Не удалось загрузить приложение");

        hideLoading();
    }

});


function showDemoMode() {

    currentUser = {
        username: "Игрок",
        points: 0,
        is_admin: false
    };

    updateUserHeader();

    document
        .getElementById("tournamentName")
        .textContent = "ASCEND S2";

    document
        .getElementById("tournamentStage")
        .textContent = "Групповая стадия";

    document
        .getElementById("matchesList")
        .innerHTML = `
            <div class="empty">
                API ещё не подключён.<br><br>
                Укажи адрес API в app.js.
            </div>
        `;

    hideLoading();
}


/*
|--------------------------------------------------------------------------
| USER
|--------------------------------------------------------------------------
*/

async function loadUser() {

    currentUser = await api("/api/me");

    updateUserHeader();
}


function updateUserHeader() {

    if (!currentUser) return;

    const username =
        currentUser.username ||
        currentUser.first_name ||
        "Игрок";

    document.getElementById("userName").textContent =
        username;

    document.getElementById("userPoints").textContent =
        `${currentUser.points || 0} PTS`;

    const letter =
        username.substring(0, 1).toUpperCase();

    document.getElementById("userAvatar").textContent =
        letter;
}


/*
|--------------------------------------------------------------------------
| PICKEM
|--------------------------------------------------------------------------
*/

async function loadPickem() {

    const data = await api("/api/pickem");

    const tournament = data.tournament;

    if (!tournament) {

        document.getElementById("tournamentName")
            .textContent = "Нет активного турнира";

        document.getElementById("tournamentStage")
            .textContent = "Загляни позже";

        document.getElementById("matchesList")
            .innerHTML = `
                <div class="empty">
                    Сейчас нет активного турнира.
                </div>
            `;

        return;
    }


    document.getElementById("tournamentName")
        .textContent = tournament.name;

    document.getElementById("tournamentStage")
        .textContent = tournament.stage;


    const points =
        Math.min(currentUser.points || 0, 500);

    const percent =
        Math.min((points / 500) * 100, 100);

    document.getElementById("progressBar")
        .style.width = `${percent}%`;

    document.getElementById("progressPoints")
        .textContent = `${points} PTS`;


    renderMatches(data.matches || []);
}


function renderMatches(matches) {

    const container =
        document.getElementById("matchesList");

    if (!matches.length) {

        container.innerHTML = `
            <div class="empty">
                Все доступные матчи уже предсказаны
                или матчей пока нет.
            </div>
        `;

        return;
    }


    container.innerHTML = matches.map(match => `

        <div class="match-card">

            <div class="match-top">

                <span class="match-time">
                    ${escapeHtml(match.match_time || "Время не указано")}
                </span>

                <span class="pending-badge">
                    PENDING
                </span>

            </div>

            <div class="teams">

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
                class="predict-btn"
                onclick="openPrediction(${match.id})"
            >
                🔮 СДЕЛАТЬ ПРОГНОЗ
            </button>

        </div>

    `).join("");
}


/*
|--------------------------------------------------------------------------
| PREDICTION
|--------------------------------------------------------------------------
*/

async function openPrediction(matchId) {

    try {

        const match =
            await api(`/api/matches/${matchId}`);

        currentMatch = match;
        selectedWinner = null;

        document.getElementById("predictionMatch")
            .textContent =
                `${match.team1}  VS  ${match.team2}`;

        document.getElementById("score1").value = "";
        document.getElementById("score2").value = "";
        document.getElementById("mvpInput").value = "";


        document.getElementById("winnerButtons")
            .innerHTML = `

                <button
                    class="choice-btn"
                    onclick="selectWinner(this, '${escapeAttr(match.team1)}')"
                >
                    ${escapeHtml(match.team1)}
                </button>

                <button
                    class="choice-btn"
                    onclick="selectWinner(this, '${escapeAttr(match.team2)}')"
                >
                    ${escapeHtml(match.team2)}
                </button>

            `;


        openModal("predictionModal");

    } catch (error) {

        showToast(error.message);
    }
}


function selectWinner(button, winner) {

    selectedWinner = winner;

    document
        .querySelectorAll("#winnerButtons .choice-btn")
        .forEach(btn => btn.classList.remove("selected"));

    button.classList.add("selected");
}


async function submitPrediction() {

    if (!currentMatch) return;

    if (!selectedWinner) {
        showToast("Выбери победителя");
        return;
    }

    const score1 =
        Number(document.getElementById("score1").value);

    const score2 =
        Number(document.getElementById("score2").value);

    const mvp =
        document.getElementById("mvpInput").value.trim();


    if (
        Number.isNaN(score1) ||
        Number.isNaN(score2)
    ) {
        showToast("Укажи счёт");
        return;
    }

    if (!mvp) {
        showToast("Укажи MVP");
        return;
    }


    try {

        await api("/api/predictions", {
            method: "POST",

            body: JSON.stringify({
                match_id: currentMatch.id,
                winner: selectedWinner,
                score1: score1,
                score2: score2,
                mvp: mvp
            })
        });


        closeModal("predictionModal");

        showToast("✅ Предсказание сохранено");

        await loadUser();
        await loadPickem();
        await loadStats();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| DAILY
|--------------------------------------------------------------------------
*/

async function loadDaily() {

    const data =
        await api("/api/daily");

    const container =
        document.getElementById("dailyContainer");


    if (!data.task) {

        container.innerHTML = `
            <div class="empty">
                🌙 Сегодня заданий нет.<br>
                Возвращайся завтра!
            </div>
        `;

        return;
    }


    const task = data.task;


    container.innerHTML = `

        <div class="daily-card">

            <div class="daily-points">
                +${task.points} PTS
            </div>

            <h3>
                ${escapeHtml(task.description)}
            </h3>

            ${
                task.completed
                ?
                `
                <div class="green-btn">
                    ✅ Выполнено
                </div>
                `
                :
                `
                <button
                    class="yellow-btn"
                    onclick="completeDaily(${task.id})"
                >
                    ВЫПОЛНИТЬ
                </button>
                `
            }

        </div>
    `;
}


async function completeDaily(taskId) {

    try {

        await api(
            `/api/daily/${taskId}/complete`,
            {
                method: "POST"
            }
        );

        showToast("⚡ Задание выполнено!");

        await loadUser();
        await loadDaily();
        await loadStats();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| TOP
|--------------------------------------------------------------------------
*/

async function loadTop() {

    const data =
        await api("/api/top");

    const container =
        document.getElementById("topList");


    if (!data.users.length) {

        container.innerHTML = `
            <div class="empty">
                Пока никто не участвовал.
            </div>
        `;

        return;
    }


    container.innerHTML =
        data.users.map((user, index) => {

            const name =
                user.username ||
                `id${user.tg_id}`;

            return `

                <div class="top-item">

                    <div class="top-position">
                        ${index + 1}
                    </div>

                    <div class="top-avatar">
                        ${escapeHtml(
                            name.substring(0,1).toUpperCase()
                        )}
                    </div>

                    <div class="top-name">
                        ${escapeHtml(name)}
                    </div>

                    <div class="top-points">
                        ${user.points} PTS
                    </div>

                </div>

            `;

        }).join("");
}


/*
|--------------------------------------------------------------------------
| STATS
|--------------------------------------------------------------------------
*/

async function loadStats() {

    const data =
        await api("/api/stats");

    document.getElementById("statPoints")
        .textContent = data.points;

    document.getElementById("statAccuracy")
        .textContent = `${data.accuracy}%`;

    document.getElementById("statPredictions")
        .textContent = data.total;

    document.getElementById("statCorrect")
        .textContent = data.correct;
}


/*
|--------------------------------------------------------------------------
| NAVIGATION
|--------------------------------------------------------------------------
*/

function showPage(page) {

    document
        .querySelectorAll(".page")
        .forEach(el => el.classList.remove("active"));

    const target =
        document.getElementById(`page-${page}`);

    if (!target) return;

    target.classList.add("active");


    document
        .querySelectorAll(".nav-btn")
        .forEach(btn => {

            btn.classList.toggle(
                "active",
                btn.dataset.page === page
            );

        });


    if (page === "pickem") {
        loadPickem();
    }

    if (page === "daily") {
        loadDaily();
    }

    if (page === "top") {
        loadTop();
    }

    if (page === "stats") {
        loadStats();
    }

    if (
        page === "admin" &&
        currentUser?.is_admin
    ) {
        loadAdmin();
    }

}


/*
|--------------------------------------------------------------------------
| ADMIN
|--------------------------------------------------------------------------
*/

async function loadAdmin() {

    if (!currentUser?.is_admin) {
        showToast("Нет доступа");
        return;
    }


    try {

        const data =
            await api("/api/admin/dashboard");


        renderAdminTournaments(
            data.tournaments || []
        );

        renderAdminMatches(
            data.matches || []
        );

        renderAdminResults(
            data.matches || []
        );

        renderAdminDaily(
            data.daily_tasks || []
        );


        const select =
            document.getElementById("matchTournament");

        select.innerHTML =
            data.tournaments
                .filter(t => t.status === "active")
                .map(t => `
                    <option value="${t.id}">
                        ${escapeHtml(t.name)}
                    </option>
                `)
                .join("");

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| ADMIN TOURNAMENTS
|--------------------------------------------------------------------------
*/

function renderAdminTournaments(tournaments) {

    const container =
        document.getElementById("adminTournaments");


    if (!tournaments.length) {

        container.innerHTML =
            `<div class="empty">Турниров нет</div>`;

        return;
    }


    container.innerHTML =
        tournaments.map(t => `

            <div class="admin-item">

                <div class="admin-item-title">
                    ${escapeHtml(t.name)}
                </div>

                <div class="admin-item-info">
                    ${escapeHtml(t.stage)}
                    ·
                    ${
                        t.status === "active"
                        ? "🟢 Активен"
                        : "⚪ Завершён"
                    }
                </div>

                <div class="admin-actions">

                    ${
                        t.status !== "active"
                        ?
                        `
                        <button
                            class="green-btn"
                            onclick="activateTournament(${t.id})"
                        >
                            Сделать активным
                        </button>
                        `
                        :
                        ""
                    }

                    ${
                        t.status === "active"
                        ?
                        `
                        <button
                            class="danger-btn"
                            onclick="finishTournament(${t.id})"
                        >
                            Завершить
                        </button>
                        `
                        :
                        ""
                    }

                </div>

            </div>

        `).join("");
}


/*
|--------------------------------------------------------------------------
| CREATE TOURNAMENT
|--------------------------------------------------------------------------
*/

function openTournamentModal() {

    document.getElementById("tournamentNameInput").value = "";
    document.getElementById("tournamentStageInput").value = "";

    openModal("tournamentModal");
}


async function createTournament() {

    const name =
        document.getElementById("tournamentNameInput")
            .value.trim();

    const stage =
        document.getElementById("tournamentStageInput")
            .value.trim();


    if (!name) {
        showToast("Укажи название турнира");
        return;
    }

    try {

        await api("/api/admin/tournaments", {

            method: "POST",

            body: JSON.stringify({
                name: name,
                stage: stage || "Групповая стадия"
            })

        });


        closeModal("tournamentModal");

        showToast("🏆 Турнир создан");

        await loadAdmin();
        await loadPickem();

    } catch (error) {

        showToast(error.message);
    }
}


async function activateTournament(id) {

    try {

        await api(
            `/api/admin/tournaments/${id}/activate`,
            { method: "POST" }
        );

        showToast("Турнир активирован");

        await loadAdmin();
        await loadPickem();

    } catch (error) {

        showToast(error.message);
    }
}


async function finishTournament(id) {

    if (!confirm("Завершить этот турнир?")) {
        return;
    }

    try {

        await api(
            `/api/admin/tournaments/${id}/finish`,
            { method: "POST" }
        );

        showToast("Турнир завершён");

        await loadAdmin();
        await loadPickem();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| ADMIN MATCHES
|--------------------------------------------------------------------------
*/

function renderAdminMatches(matches) {

    const container =
        document.getElementById("adminMatches");


    if (!matches.length) {

        container.innerHTML =
            `<div class="empty">Матчей нет</div>`;

        return;
    }


    container.innerHTML =
        matches.map(m => `

            <div class="admin-item">

                <div class="admin-item-title">
                    ${escapeHtml(m.team1)}
                    <span style="color:#ffd400">VS</span>
                    ${escapeHtml(m.team2)}
                </div>

                <div class="admin-item-info">
                    ${escapeHtml(m.tournament_name || "")}
                    ·
                    ${escapeHtml(m.match_time || "Время не указано")}
                </div>

                <div class="admin-actions">

                    <button
                        class="danger-btn"
                        onclick="deleteMatch(${m.id})"
                    >
                        🗑 Удалить
                    </button>

                </div>

            </div>

        `).join("");
}


function openMatchModal() {

    const select =
        document.getElementById("matchTournament");

    if (!select.options.length) {

        showToast("Сначала создай активный турнир");

        return;
    }


    document.getElementById("team1Input").value = "";
    document.getElementById("team2Input").value = "";
    document.getElementById("matchTimeInput").value = "";

    openModal("matchModal");
}


async function createMatch() {

    const tournamentId =
        Number(
            document.getElementById("matchTournament").value
        );

    const team1 =
        document.getElementById("team1Input")
            .value.trim();

    const team2 =
        document.getElementById("team2Input")
            .value.trim();

    const matchTime =
        document.getElementById("matchTimeInput")
            .value.trim();


    if (!team1 || !team2) {

        showToast("Укажи обе команды");

        return;
    }


    try {

        await api("/api/admin/matches", {

            method: "POST",

            body: JSON.stringify({

                tournament_id: tournamentId,

                team1: team1,

                team2: team2,

                match_time: matchTime || null

            })

        });


        closeModal("matchModal");

        showToast("⚔️ Матч добавлен");

        await loadAdmin();
        await loadPickem();

    } catch (error) {

        showToast(error.message);
    }
}


async function deleteMatch(id) {

    if (!confirm("Удалить матч?")) {
        return;
    }


    try {

        await api(
            `/api/admin/matches/${id}`,
            {
                method: "DELETE"
            }
        );

        showToast("Матч удалён");

        await loadAdmin();
        await loadPickem();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| ADMIN RESULTS
|--------------------------------------------------------------------------
*/

function renderAdminResults(matches) {

    const container =
        document.getElementById("adminResults");


    const pending =
        matches.filter(m => m.status === "pending");


    if (!pending.length) {

        container.innerHTML =
            `<div class="empty">Нет матчей без результата</div>`;

        return;
    }


    container.innerHTML =
        pending.map(m => `

            <div class="admin-item">

                <div class="admin-item-title">
                    ${escapeHtml(m.team1)}
                    <span style="color:#ffd400">VS</span>
                    ${escapeHtml(m.team2)}
                </div>

                <div class="admin-actions">

                    <button
                        class="yellow-btn"
                        onclick="openResultModal(${m.id})"
                    >
                        🏁 Внести результат
                    </button>

                </div>

            </div>

        `).join("");
}


async function openResultModal(id) {

    try {

        const match =
            await api(`/api/matches/${id}`);

        currentMatch = match;

        document.getElementById("resultMatch")
            .textContent =
                `${match.team1} VS ${match.team2}`;


        document.getElementById("resultWinner")
            .innerHTML = `

                <option value="${escapeAttr(match.team1)}">
                    ${escapeHtml(match.team1)}
                </option>

                <option value="${escapeAttr(match.team2)}">
                    ${escapeHtml(match.team2)}
                </option>

            `;


        document.getElementById("resultScore1").value = "";
        document.getElementById("resultScore2").value = "";
        document.getElementById("resultMvp").value = "";


        openModal("resultModal");

    } catch (error) {

        showToast(error.message);
    }
}


async function saveResult() {

    if (!currentMatch) return;


    const winner =
        document.getElementById("resultWinner").value;

    const score1 =
        Number(document.getElementById("resultScore1").value);

    const score2 =
        Number(document.getElementById("resultScore2").value);

    const mvp =
        document.getElementById("resultMvp")
            .value.trim();


    if (
        Number.isNaN(score1) ||
        Number.isNaN(score2) ||
        !mvp
    ) {

        showToast("Заполни все поля");

        return;
    }


    try {

        await api(
            `/api/admin/matches/${currentMatch.id}/result`,
            {

                method: "POST",

                body: JSON.stringify({

                    winner: winner,

                    score1: score1,

                    score2: score2,

                    mvp: mvp

                })

            }
        );


        closeModal("resultModal");

        showToast("🏁 Результат сохранён");

        await loadAdmin();
        await loadPickem();
        await loadUser();
        await loadStats();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| ADMIN DAILY
|--------------------------------------------------------------------------
*/

function renderAdminDaily(tasks) {

    const container =
        document.getElementById("adminDaily");


    if (!tasks.length) {

        container.innerHTML =
            `<div class="empty">Ежедневок нет</div>`;

        return;
    }


    container.innerHTML =
        tasks.map(task => `

            <div class="admin-item">

                <div class="admin-item-title">
                    ${escapeHtml(task.description)}
                </div>

                <div class="admin-item-info">
                    ${task.task_date}
                    ·
                    +${task.points} PTS
                </div>

                <div class="admin-actions">

                    <button
                        class="danger-btn"
                        onclick="deleteDaily(${task.id})"
                    >
                        🗑 Удалить
                    </button>

                </div>

            </div>

        `).join("");
}


function openDailyModal() {

    document.getElementById("dailyDescription").value = "";
    document.getElementById("dailyPoints").value = "";

    openModal("dailyModal");
}


async function createDaily() {

    const description =
        document.getElementById("dailyDescription")
            .value.trim();

    const points =
        Number(
            document.getElementById("dailyPoints").value
        );


    if (!description) {

        showToast("Укажи задание");

        return;
    }


    if (!points || points < 1) {

        showToast("Укажи награду");

        return;
    }


    try {

        await api("/api/admin/daily", {

            method: "POST",

            body: JSON.stringify({

                description: description,

                points: points

            })

        });


        closeModal("dailyModal");

        showToast("⚡ Ежедневка добавлена");

        await loadAdmin();
        await loadDaily();

    } catch (error) {

        showToast(error.message);
    }
}


async function deleteDaily(id) {

    if (!confirm("Удалить ежедневное задание?")) {
        return;
    }


    try {

        await api(
            `/api/admin/daily/${id}`,
            {
                method: "DELETE"
            }
        );

        showToast("Ежедневка удалена");

        await loadAdmin();
        await loadDaily();

    } catch (error) {

        showToast(error.message);
    }
}


/*
|--------------------------------------------------------------------------
| MODALS
|--------------------------------------------------------------------------
*/

function openModal(id) {

    document
        .getElementById(id)
        .classList.remove("hidden");
}


function closeModal(id) {

    document
        .getElementById(id)
        .classList.add("hidden");
}


document.querySelectorAll(".modal").forEach(modal => {

    modal.addEventListener("click", event => {

        if (event.target === modal) {
            modal.classList.add("hidden");
        }

    });

});


/*
|--------------------------------------------------------------------------
| TOAST
|--------------------------------------------------------------------------
*/

let toastTimer = null;

function showToast(message) {

    const toast =
        document.getElementById("toast");

    toast.textContent = message;

    toast.classList.add("show");


    clearTimeout(toastTimer);

    toastTimer =
        setTimeout(() => {

            toast.classList.remove("show");

        }, 2500);
}


/*
|--------------------------------------------------------------------------
| LOADING
|--------------------------------------------------------------------------
*/

function hideLoading() {

    document
        .getElementById("loading")
        .classList.add("hidden");

    document
        .getElementById("content")
        .classList.remove("hidden");

    document
        .getElementById("bottomNav")
        .classList.remove("hidden");
}


/*
|--------------------------------------------------------------------------
| ESCAPE
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttr(value) {

    return escapeHtml(value)
        .replaceAll("`", "&#096;");
}
