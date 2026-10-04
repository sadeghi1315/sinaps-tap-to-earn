(function () {
'use strict';

const API = 'https://sinaps-backend.onrender.com';
const MANIFEST = 'https://sadeghi1315.github.io/sinaps-tap-to-earn/tonconnect-manifest.json';

const TREASURY = 'UQDMsJu14wu-EHSjaRpufQdPb73pKVRkQvHNezgA2zF69sJX';
const FEE = '100000000';
const MAINNET = '-239';

let tg = null;
let user = null;
let initData = '';

let tonUI = null;
let balance = 0;
let energy = 1000;
let maxEnergy = 1000;

let queue = 0;
let pending = 0;
let processing = false;
let energyTimer = null;
let withdrawing = false;

const WALLET_OWNER_KEY = 'sinaps_wallet_owner_v3';
const LOCAL_STATE_KEY = 'sinaps_v9';

const $ = id => document.getElementById(id);


/* =========================================================
   BASIC
========================================================= */

function notify(msg, ok = false) {

    let x = $('sinapsToast');

    if (!x) {

        x = document.createElement('div');
        x.id = 'sinapsToast';

        document.body.appendChild(x);
    }

    x.textContent = msg;

    x.className = ok ? 'ok' : '';

    x.style.display = 'block';

    clearTimeout(x._t);

    x._t = setTimeout(() => {

        x.style.display = 'none';

    }, 2800);
}


function esc(s) {

    return String(s ?? '').replace(
        /[&<>'"]/g,
        c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[c])
    );
}


/* =========================================================
   API
========================================================= */

async function api(path, options = {}) {

    options.headers = Object.assign(
        {
            'Content-Type': 'application/json',
            'X-Telegram-Init-Data': initData
        },
        options.headers || {}
    );

    if (
        options.body &&
        typeof options.body === 'string'
    ) {

        try {

            const b = JSON.parse(options.body);

            b.init_data = initData;

            options.body = JSON.stringify(b);

        } catch {}
    }

    const r = await fetch(
        API + path,
        options
    );

    let d = {};

    try {

        d = await r.json();

    } catch {}

    if (!r.ok) {

        throw new Error(
            d.error ||
            d.message ||
            ('HTTP ' + r.status)
        );
    }

    return d;
}


/* =========================================================
   TELEGRAM
========================================================= */

function telegram() {

    if (!window.Telegram?.WebApp) {
        return;
    }

    tg = window.Telegram.WebApp;

    tg.ready();

    try {
        tg.expand();
    } catch {}

    user =
        tg.initDataUnsafe?.user ||
        null;

    initData =
        tg.initData ||
        '';

    if (!user) {
        return;
    }

    if ($('username')) {

        $('username').textContent =
            user.username
                ? '@' + user.username
                : (
                    user.first_name ||
                    'SINAPS User'
                );
    }

    if ($('avatarLetter')) {

        $('avatarLetter').textContent =
            (
                user.first_name ||
                user.username ||
                'S'
            ).charAt(0).toUpperCase();
    }

    if (
        user.photo_url &&
        $('userAvatar')
    ) {

        $('userAvatar').src =
            user.photo_url;

        $('userAvatar').style.display =
            'block';

        if ($('avatarLetter')) {

            $('avatarLetter').style.display =
                'none';
        }
    }
}


/* =========================================================
   LOCAL STATE
========================================================= */

function save() {

    try {

        localStorage.setItem(
            LOCAL_STATE_KEY,
            JSON.stringify({
                balance,
                energy,
                maxEnergy
            })
        );

    } catch {}
}


function load() {

    try {

        const x = JSON.parse(
            localStorage.getItem(
                LOCAL_STATE_KEY
            ) || '{}'
        );

        if (
            Number.isFinite(+x.balance)
        ) {
            balance = +x.balance;
        }

        if (
            Number.isFinite(+x.energy)
        ) {
            energy = +x.energy;
        }

        if (
            Number.isFinite(+x.maxEnergy)
        ) {
            maxEnergy = +x.maxEnergy;
        }

    } catch {}
}


/* =========================================================
   RENDER
========================================================= */

function render() {

    if ($('balance')) {

        $('balance').textContent =
            Math.max(
                0,
                Math.floor(balance)
            ).toLocaleString();
    }

    if ($('energy')) {

        $('energy').textContent =
            Math.max(
                0,
                Math.floor(energy)
            ) +
            ' / ' +
            Math.floor(maxEnergy);
    }

    if ($('energyFill')) {

        $('energyFill').style.width =
            Math.max(
                0,
                Math.min(
                    100,
                    energy / maxEnergy * 100
                )
            ) + '%';
    }

    if ($('withdrawBalance')) {

        $('withdrawBalance').textContent =
            Math.floor(balance)
                .toLocaleString() +
            ' SNP';
    }
}


/* =========================================================
   USER
========================================================= */

async function loadUser() {

    if (!user?.id) {
        return;
    }

    try {

        const d =
            await api(
                '/api/user',
                {
                    method: 'POST',

                    body: JSON.stringify({
                        telegram_id:
                            user.id,

                        username:
                            user.username ||
                            user.first_name ||
                            '',

                        start_param:
                            tg?.initDataUnsafe
                                ?.start_param ||
                            ''
                    })
                }
            );

        const u =
            d.user || {};

        if (!pending) {

            balance =
                Number(
                    u.balance || 0
                );

            energy =
                Number(
                    u.energy || 0
                );

            maxEnergy =
                Number(
                    u.max_energy || 1000
                );

            render();

            save();
        }

    } catch (e) {

        notify(e.message);
    }
}


/* =========================================================
   TAP
========================================================= */

async function sendTap() {

    return api(
        '/api/tap',
        {
            method: 'POST',

            body: JSON.stringify({
                telegram_id:
                    user.id
            })
        }
    );
}


async function processTaps() {

    if (
        processing ||
        !queue
    ) {
        return;
    }

    processing = true;

    while (queue) {

        try {

            const d =
                await sendTap();

            queue--;
            pending--;

            if (
                !pending &&
                !queue
            ) {

                const u =
                    d.user || {};

                balance =
                    Number(
                        u.balance ??
                        balance
                    );

                energy =
                    Number(
                        u.energy ??
                        energy
                    );

                maxEnergy =
                    Number(
                        u.max_energy ??
                        maxEnergy
                    );

                render();
                save();
            }

        } catch (e) {

            console.log(e);

            break;
        }
    }

    processing = false;

    if (queue) {

        setTimeout(
            processTaps,
            500
        );
    }
}


function tap() {

    const a =
        $('tapArea');

    if (!a) {
        return;
    }

    a.addEventListener(
        'pointerdown',
        e => {

            e.preventDefault();

            if (
                !user?.id ||
                energy <= 0
            ) {
                return;
            }

            balance++;
            energy--;

            queue++;
            pending++;

            render();
            save();

            const r =
                a.getBoundingClientRect();

            const f =
                document.createElement(
                    'div'
                );

            f.className =
                'floater';

            f.textContent =
                '+1';

            f.style.left =
                (
                    e.clientX -
                    r.left
                ) + 'px';

            f.style.top =
                (
                    e.clientY -
                    r.top
                ) + 'px';

            $('floaters')
                ?.appendChild(f);

            setTimeout(
                () => f.remove(),
                700
            );

            $('sCoin')
                ?.classList.add(
                    'hit'
                );

            setTimeout(
                () => {
                    $('sCoin')
                        ?.classList.remove(
                            'hit'
                        );
                },
                120
            );

            processTaps();

        },
        {
            passive: false
        }
    );
}


/* =========================================================
   ENERGY
========================================================= */

function startEnergy() {

    clearInterval(
        energyTimer
    );

    energyTimer =
        setInterval(
            () => {

                if (
                    energy <
                    maxEnergy
                ) {

                    energy++;

                    render();
                    save();
                }

            },
            3000
        );
}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(page) {

    document
        .querySelectorAll('.page')
        .forEach(
            p => {
                p.classList.remove(
                    'active'
                );
            }
        );

    const target =
        document.getElementById(
            'page-' + page
        );

    if (target) {

        target.classList.add(
            'active'
        );
    }

    document
        .querySelectorAll(
            '.bottom-nav button'
        )
        .forEach(
            b => {

                b.classList.toggle(
                    'active',
                    b.dataset.page ===
                    page
                );
            }
        );

    if (
        page === 'tasks'
    ) {
        loadTasks();
    }

    if (
        page === 'friends'
    ) {
        loadFriends();
    }

    if (
        page === 'wallet'
    ) {
        loadHistory();
    }
}


function nav() {

    document
        .querySelectorAll(
            '.bottom-nav button, [data-page]'
        )
        .forEach(
            b => {

                if (
                    b.dataset.boundNav
                ) {
                    return;
                }

                b.dataset.boundNav =
                    '1';

                b.addEventListener(
                    'click',
                    () => {

                        const page =
                            b.dataset.page;

                        if (page) {

                            showPage(
                                page
                            );
                        }
                    }
                );
            }
        );
}


/* =========================================================
   DAILY REWARD
========================================================= */

/*
 * گرفتن اطلاعات Daily
 *
 * اول /api/daily را امتحان می‌کند.
 * اگر بک‌اند نسخه جدید status داشته باشد
 * /api/daily/status را امتحان می‌کند.
 */

async function getDailyStatus() {

    if (!user?.id) {

        throw new Error(
            'Telegram user not found.'
        );
    }

    try {

        return await api(
            '/api/daily?telegram_id=' +
            encodeURIComponent(
                user.id
            ),
            {
                headers: {}
            }
        );

    } catch (firstError) {

        console.log(
            'Old daily endpoint failed:',
            firstError
        );

        try {

            return await api(
                '/api/daily/status?telegram_id=' +
                encodeURIComponent(
                    user.id
                ),
                {
                    headers: {}
                }
            );

        } catch {

            throw firstError;
        }
    }
}


/*
 * تبدیل پاسخ API به ساختار استاندارد
 */

function normalizeDaily(data) {

    const daily =
        data?.daily ||
        {};

    let streak =
        Number(
            data?.streak ??
            daily?.streak ??
            data?.currentDay ??
            0
        );

    let lastClaim =
        data?.last_claim_date ??
        daily?.last_claim_date ??
        null;

    const today =
        new Date()
            .toISOString()
            .slice(0, 10);

    const claimedToday =
        Boolean(
            data?.claimedToday ??
            data?.claimed_today ??
            (
                lastClaim ===
                today
            )
        );

    /*
     * اگر API جدید claimedDays داشته باشد
     */

    let claimedDays =
        Array.isArray(
            data?.claimedDays
        )
            ? data.claimedDays.map(
                Number
            )
            : [];

    /*
     * اگر API فعلی فقط streak دارد،
     * روزهای قبل را هم به عنوان دریافت‌شده
     * در نظر می‌گیریم.
     */

    if (
        !claimedDays.length &&
        streak > 0
    ) {

        for (
            let i = 1;
            i < streak;
            i++
        ) {
            claimedDays.push(i);
        }
    }

    if (
        claimedToday &&
        streak > 0
    ) {

        if (
            !claimedDays.includes(
                streak
            )
        ) {

            claimedDays.push(
                streak
            );
        }
    }

    return {
        streak,
        lastClaim,
        claimedToday,
        claimedDays
    };
}


/*
 * باز کردن Daily
 */

async function openDaily() {

    let modal =
        $('dailyModal');

    /*
     * اگر Modal وجود ندارد،
     * کامل ساخته می‌شود.
     */

    if (!modal) {

        modal =
            document.createElement(
                'div'
            );

        modal.id =
            'dailyModal';

        modal.className =
            'modalx';

        modal.innerHTML = `

            <div class="modalx-box daily-modal-box">

                <button
                    class="closex"
                    id="closeDaily">
                    ×
                </button>

                <div class="daily-title">

                    <div class="daily-icon">
                        🎁
                    </div>

                    <div>

                        <small>
                            DAILY REWARD
                        </small>

                        <h2>
                            Daily Gifts
                        </h2>

                        <p>
                            Claim your daily SNP
                        </p>

                    </div>

                </div>

                <div
                    id="daysGrid"
                    class="days-grid">
                </div>

                <div
                    id="dailyMsg"
                    class="daily-message">
                    Loading...
                </div>

            </div>
        `;

        document.body.appendChild(
            modal
        );

        $('closeDaily').onclick =
            () => {

                modal.classList.remove(
                    'show'
                );
            };

        modal.onclick =
            e => {

                if (
                    e.target ===
                    modal
                ) {

                    modal.classList.remove(
                        'show'
                    );
                }
            };
    }

    modal.classList.add(
        'show'
    );

    const grid =
        $('daysGrid');

    const msg =
        $('dailyMsg');

    if (!grid || !msg) {
        return;
    }

    /*
     * Loading state
     */

    grid.innerHTML = `
        <div class="daily-loading">
            Loading daily rewards...
        </div>
    `;

    msg.textContent =
        'Checking your daily reward...';

    try {

        const raw =
            await getDailyStatus();

        const d =
            normalizeDaily(
                raw
            );

        const streak =
            Math.max(
                0,
                Math.min(
                    30,
                    d.streak
                )
            );

        const claimedToday =
            d.claimedToday;

        const claimedDays =
            d.claimedDays || [];

        /*
         * روز بعدی
         */

        const nextDay =
            claimedToday
                ? Math.min(
                    streak + 1,
                    30
                )
                : Math.min(
                    streak + 1,
                    30
                );

        let html = '';

        for (
            let i = 1;
            i <= 30;
            i++
        ) {

            const reward =
                i * 10;

            const claimed =
                claimedDays.includes(
                    i
                );

            const current =
                !claimedToday &&
                i === nextDay;

            /*
             * اگر روز 30 دریافت شده،
             * دیگر روزی برای Claim نیست.
             */

            const finished =
                streak >= 30 &&
                claimedToday;

            html += `

                <button
                    type="button"
                    class="
                        day
                        ${claimed ? 'claimed' : ''}
                        ${current && !finished ? 'current' : ''}
                        ${i < nextDay && !claimed ? 'previous' : ''}
                    "
                    data-day="${i}"
                    ${
                        current && !finished
                            ? ''
                            : 'disabled'
                    }
                >

                    <b>
                        DAY ${i}
                    </b>

                    <strong>
                        ${reward}
                        <small>
                            SNP
                        </small>
                    </strong>

                    <span
                        class="day-check">
                        ${
                            claimed
                                ? '✓'
                                : ''
                        }
                    </span>

                </button>
            `;
        }

        grid.innerHTML =
            html;

        /*
         * فقط روز قابل دریافت
         * قابل کلیک است.
         */

        const currentButton =
            grid.querySelector(
                '.day.current'
            );

        if (currentButton) {

            currentButton.onclick =
                claimDaily;
        }

        /*
         * پیام پایین
         */

        if (
            streak >= 30 &&
            claimedToday
        ) {

            msg.innerHTML =
                '🏆 <b>30 days completed!</b> Come back tomorrow.';

        } else if (
            claimedToday
        ) {

            msg.innerHTML =
                `✅ <b>Day ${streak}</b> received today. Come back tomorrow.`;

        } else {

            msg.innerHTML =
                `🎁 <b>Day ${nextDay}</b> is ready — claim ${nextDay * 10} SNP.`;
        }

    } catch (e) {

        console.error(
            'Daily error:',
            e
        );

        grid.innerHTML = `

            <div class="daily-error">

                🎁

                <br><br>

                Unable to load daily rewards.

                <br>

                <small>
                    ${esc(
                        e.message ||
                        'Daily service unavailable'
                    )}
                </small>

            </div>
        `;

        msg.textContent =
            'Please try again.';
    }
}


/*
 * Claim Daily
 */

async function claimDaily(e) {

    const button =
        e.currentTarget;

    if (
        !button ||
        button.disabled
    ) {
        return;
    }

    button.disabled =
        true;

    button.textContent =
        '...';

    try {

        const d =
            await api(
                '/api/daily/claim',
                {
                    method: 'POST',

                    body: JSON.stringify({
                        telegram_id:
                            user.id
                    })
                }
            );

        /*
         * پاسخ فعلی بک‌اند:
         * d.user.balance
         */

        if (
            d.user &&
            d.user.balance !== undefined
        ) {

            balance =
                Number(
                    d.user.balance
                );

        } else if (
            d.balance !== undefined
        ) {

            balance =
                Number(
                    d.balance
                );
        }

        render();
        save();

        notify(
            'Day ' +
            (
                d.day ||
                'reward'
            ) +
            ' claimed: +' +
            (
                d.reward ||
                0
            ) +
            ' SNP',
            true
        );

        /*
         * دوباره Daily را بازسازی می‌کنیم
         * تا ✓ سبز روی روز دریافت‌شده بیاید.
         */

        await openDaily();

    } catch (e) {

        button.disabled =
            false;

        button.innerHTML = `
            <b>
                DAY ${button.dataset.day || ''}
            </b>
            <strong>
                ${
                    Number(
                        button.dataset.day ||
                        1
                    ) * 10
                }
                <small>SNP</small>
            </strong>
        `;

        notify(
            e.message ||
            'Daily reward failed'
        );
    }
}


/* =========================================================
   TASKS
========================================================= */

async function loadTasks() {

    const box =
        $('tasksList');

    if (!box) {
        return;
    }

    box.innerHTML =
        '<div class="loading">Checking tasks...</div>';

    try {

        const d =
            await api(
                '/api/tasks'
            );

        const list =
            d.tasks || [];

        box.innerHTML =
            list.map(
                t => {

                    let icon =
                        '💎';

                    if (
                        t.id ===
                        'channel'
                    ) {
                        icon = '📢';
                    }

                    if (
                        t.id ===
                        'group'
                    ) {
                        icon = '👥';
                    }

                    if (
                        t.id ===
                        'twitter'
                    ) {
                        icon = '𝕏';
                    }

                    return `

                        <div
                            class="task-card">

                            <div
                                class="task-icon">
                                ${icon}
                            </div>

                            <div
                                class="task-main">

                                <b>
                                    ${esc(
                                        t.title
                                    )}
                                </b>

                                <small>
                                    +${Number(
                                        t.reward
                                    ).toLocaleString()}
                                    SNP
                                </small>

                            </div>

                            <button
                                class="task-btn"
                                data-task="${esc(
                                    t.id
                                )}"
                                data-url="${esc(
                                    t.url || ''
                                )}">
                                Check
                            </button>

                        </div>
                    `;
                }
            ).join('');

        box
            .querySelectorAll(
                '.task-btn'
            )
            .forEach(
                b => {

                    b.onclick =
                        () =>
                            claimTask(b);
                }
            );

    } catch (e) {

        box.innerHTML =
            '<div class="error-card">' +
            esc(e.message) +
            '</div>';
    }
}


async function claimTask(btn) {

    const id =
        btn.dataset.task;

    btn.disabled =
        true;

    try {

        if (
            btn.dataset.url
        ) {

            window.open(
                btn.dataset.url,
                '_blank'
            );
        }

        btn.textContent =
            'Checking...';

        const d =
            await api(
                '/api/tasks/claim',
                {
                    method: 'POST',

                    body: JSON.stringify({
                        telegram_id:
                            user.id,

                        task_id:
                            id
                    })
                }
            );

        if (
            d.user &&
            d.user.balance !== undefined
        ) {

            balance =
                Number(
                    d.user.balance
                );
        }

        render();
        save();

        btn.textContent =
            '✓ Done';

        btn.classList.add(
            'done'
        );

        notify(
            'Task completed +' +
            (
                d.reward ||
                0
            ) +
            ' SNP',
            true
        );

    } catch (e) {

        btn.disabled =
            false;

        btn.textContent =
            'Try again';

        notify(
            e.message
        );
    }
}


/* =========================================================
   FRIENDS
========================================================= */

async function loadFriends() {

    try {

        const d =
            await api(
                '/api/friends?telegram_id=' +
                encodeURIComponent(
                    user.id
                ),
                {
                    headers: {}
                }
            );

        if (
            $('inviteCode')
        ) {

            $('inviteCode').textContent =
                d.referral_code ||
                '-';

            $('inviteCode').dataset.code =
                d.referral_code ||
                '';
        }

        if (
            $('friendsCount')
        ) {

            $('friendsCount').textContent =
                d.referral_count ||
                0;
        }

        const list =
            d.friends ||
            [];

        if (
            $('friendsList')
        ) {

            $('friendsList').innerHTML =
                list.length

                    ? list.map(
                        f => `

                            <div
                                class="friend-row">

                                <span>
                                    ${esc(
                                        f.username ||
                                        'User'
                                    )}
                                </span>

                                <b>
                                    ${Number(
                                        f.balance ||
                                        0
                                    ).toLocaleString()}
                                    SNP
                                </b>

                            </div>
                        `
                    ).join('')

                    : '<div class="empty">' +
                      'No invited users yet.' +
                      '</div>';
        }

    } catch (e) {

        notify(
            e.message
        );
    }
}


window.sinapsCopyInvite =
    async function () {

        try {

            const code =
                $('inviteCode')
                    ?.dataset.code ||
                '';

            if (!code) {

                throw new Error(
                    'Referral code not ready.'
                );
            }

            const link =
                'https://t.me/SNPCOINBot?start=' +
                encodeURIComponent(
                    code
                );

            await navigator.clipboard.writeText(
                link
            );

            notify(
                'Invite link copied',
                true
            );

        } catch (e) {

            notify(
                e.message
            );
        }
    };


/* =========================================================
   HISTORY
========================================================= */

async function loadHistory() {

    const box =
        $('historyList');

    if (
        !box ||
        !user
    ) {
        return;
    }

    try {

        const d =
            await api(
                '/api/history?telegram_id=' +
                encodeURIComponent(
                    user.id
                ),
                {
                    headers: {}
                }
            );

        const rows =
            d.transactions ||
            [];

        box.innerHTML =
            rows.length

                ? rows.map(
                    x => {

                        const amount =
                            Number(
                                x.amount
                            );

                        return `

                            <div
                                class="history-row">

                                <div>

                                    <b>
                                        ${esc(
                                            String(
                                                x.type ||
                                                ''
                                            ).replaceAll(
                                                '_',
                                                ' '
                                            )
                                        )}
                                    </b>

                                    <small>
                                        ${esc(
                                            x.description ||
                                            ''
                                        )}
                                    </small>

                                </div>

                                <strong
                                    class="${
                                        amount < 0
                                            ? 'neg'
                                            : 'pos'
                                    }">

                                    ${
                                        amount > 0
                                            ? '+'
                                            : ''
                                    }

                                    ${amount.toLocaleString()}
                                    SNP

                                </strong>

                                <span>
                                    ${esc(
                                        x.status ||
                                        ''
                                    )}
                                </span>

                            </div>
                        `;
                    }
                ).join('')

                : '<div class="empty">' +
                  'No transactions yet.' +
                  '</div>';

    } catch (e) {

        box.textContent =
            e.message;
    }
}


/* =========================================================
   WALLET
========================================================= */

function walletOwnerKey() {

    return user?.id
        ? String(user.id)
        : '';
}


function getSavedWalletOwner() {

    try {

        return localStorage.getItem(
            WALLET_OWNER_KEY
        );

    } catch {

        return null;
    }
}


function setSavedWalletOwner(id) {

    try {

        if (id) {

            localStorage.setItem(
                WALLET_OWNER_KEY,
                String(id)
            );

        } else {

            localStorage.removeItem(
                WALLET_OWNER_KEY
            );
        }

    } catch {}
}


function clearWalletUI() {

    if (
        $('walletAddress')
    ) {

        $('walletAddress').textContent =
            'Not connected';

        $('walletAddress')
            .setAttribute(
                'data-address',
                ''
            );
    }

    const mini =
        $('wallet-mini');

    if (mini) {

        mini.textContent =
            'Wallet not connected';
    }

    const connect =
        $('connectWalletBtn');

    if (connect) {

        connect.style.display =
            'block';
    }

    const disconnect =
        $('disconnectWallet');

    if (disconnect) {

        disconnect.style.display =
            'none';
    }
}


function showConnectedWallet(
    address
) {

    if (!address) {

        clearWalletUI();

        return;
    }

    if (
        $('walletAddress')
    ) {

        $('walletAddress').textContent =
            address.slice(0, 8) +
            '...' +
            address.slice(-8);

        $('walletAddress')
            .setAttribute(
                'data-address',
                address
            );
    }

    if (
        $('wallet-mini')
    ) {

        $('wallet-mini').textContent =
            address.slice(0, 6) +
            '...' +
            address.slice(-6);
    }

    const connect =
        $('connectWalletBtn');

    if (connect) {

        connect.style.display =
            'none';
    }

    const disconnect =
        $('disconnectWallet');

    if (disconnect) {

        disconnect.style.display =
            'block';
    }
}


async function setupWallet() {

    if (
        !window.TON_CONNECT_UI
    ) {

        console.log(
            'TON Connect UI not loaded'
        );

        return;
    }

    if (!user?.id) {
        return;
    }

    try {

        const currentOwner =
            walletOwnerKey();

        const previousOwner =
            getSavedWalletOwner();

        tonUI =
            new window.TON_CONNECT_UI.TonConnectUI(
                {
                    manifestUrl:
                        MANIFEST,

                    buttonRootId:
                        'ton-connect'
                }
            );

        /*
         * اگر Telegram account عوض شده،
         * Wallet محلی قبلی را قطع می‌کنیم.
         */

        if (
            previousOwner &&
            currentOwner &&
            previousOwner !==
            currentOwner
        ) {

            console.log(
                'Telegram account changed:',
                previousOwner,
                '->',
                currentOwner
            );

            try {

                await tonUI.disconnect();

            } catch (e) {

                console.log(
                    'Old wallet disconnect:',
                    e
                );
            }

            setSavedWalletOwner(
                null
            );

            clearWalletUI();
        }


        tonUI.onStatusChange(
            async wallet => {

                if (
                    !wallet ||
                    !wallet.account ||
                    !wallet.account.address
                ) {

                    clearWalletUI();

                    return;
                }

                const address =
                    wallet.account.address;

                setSavedWalletOwner(
                    currentOwner
                );

                showConnectedWallet(
                    address
                );

                try {

                    await api(
                        '/api/wallet/connect',
                        {
                            method: 'POST',

                            body: JSON.stringify({
                                telegram_id:
                                    user.id,

                                wallet_address:
                                    address
                            })
                        }
                    );

                    notify(
                        'Wallet connected',
                        true
                    );

                } catch (e) {

                    console.error(
                        'Wallet save:',
                        e
                    );

                    notify(
                        'Wallet connected, but could not be saved.'
                    );
                }
            }
        );


        $('connectWalletBtn')
            ?.addEventListener(
                'click',
                () => {

                    if (tonUI) {

                        tonUI.openModal();
                    }
                }
            );


        $('disconnectWallet')
            ?.addEventListener(
                'click',
                async () => {

                    try {

                        await tonUI.disconnect();

                        setSavedWalletOwner(
                            null
                        );

                        clearWalletUI();

                        await api(
                            '/api/wallet/disconnect',
                            {
                                method: 'POST',

                                body: JSON.stringify({
                                    telegram_id:
                                        user.id
                                })
                            }
                        );

                        notify(
                            'Wallet disconnected',
                            true
                        );

                    } catch (e) {

                        notify(
                            e.message
                        );
                    }
                }
            );

    } catch (e) {

        console.error(
            'TON Connect error:',
            e
        );
    }
}


/* =========================================================
   WITHDRAW
========================================================= */

async function setupWithdraw() {

    const b =
        $('withdrawBtn');

    if (!b) {
        return;
    }

    b.onclick =
        async () => {

            if (
                withdrawing
            ) {
                return;
            }

            withdrawing =
                true;

            b.disabled =
                true;

            try {

                if (queue) {

                    await processTaps();
                }

                if (
                    !tonUI ||
                    !tonUI.wallet
                ) {

                    throw new Error(
                        'First connect your TON wallet.'
                    );
                }

                const a =
                    Number(
                        $('withdrawAmount')
                            ?.value
                    );

                if (
                    !Number.isInteger(a) ||
                    a <= 0 ||
                    a > balance
                ) {

                    throw new Error(
                        'Invalid SNP amount.'
                    );
                }

                const wa =
                    tonUI.wallet.account.address;

                const d =
                    await api(
                        '/api/withdraw/create',
                        {
                            method: 'POST',

                            body: JSON.stringify({
                                telegram_id:
                                    user.id,

                                wallet_address:
                                    wa,

                                amount:
                                    a
                            })
                        }
                    );

                await tonUI.sendTransaction(
                    {
                        validUntil:
                            Math.floor(
                                Date.now() /
                                1000
                            ) + 300,

                        network:
                            MAINNET,

                        messages: [
                            {
                                address:
                                    TREASURY,

                                amount:
                                    FEE
                            }
                        ]
                    }
                );

                const v =
                    await api(
                        '/api/withdraw/verify',
                        {
                            method: 'POST',

                            body: JSON.stringify({
                                telegram_id:
                                    user.id,

                                withdrawal_id:
                                    d.withdrawal_id,

                                wallet_address:
                                    wa
                            })
                        }
                    );

                if (
                    $('withdrawStatus')
                ) {

                    $('withdrawStatus')
                        .textContent =
                        v.status ===
                        'verified'

                            ? 'Payment verified. Processing.'

                            : 'Payment sent. Under review.';
                }

                if (
                    $('withdrawAmount')
                ) {

                    $('withdrawAmount')
                        .value = '';
                }

                loadHistory();

                notify(
                    'Withdrawal request created',
                    true
                );

            } catch (e) {

                if (
                    $('withdrawStatus')
                ) {

                    $('withdrawStatus')
                        .textContent =
                        e.message;
                }

                notify(
                    e.message
                );

            } finally {

                withdrawing =
                    false;

                b.disabled =
                    false;
            }
        };
}


window.sinapsWithdraw =
    async function () {

        const b =
            $('withdrawBtn');

        if (b) {
            b.click();
        }
    };


/* =========================================================
   CSS
========================================================= */

function css() {

    const s =
        document.createElement(
            'style'
        );

    s.textContent = `

/* =====================================================
   DAILY MODAL
===================================================== */

#dailyModal {

    position: fixed;

    inset: 0;

    z-index: 99999;

    display: none;

    align-items: flex-end;

    justify-content: center;

    padding: 12px;

    background:
        rgba(0,0,0,.72);

    backdrop-filter:
        blur(8px);
}

#dailyModal.show {

    display: flex;
}


.daily-modal-box {

    width: 100%;

    max-width: 430px;

    max-height: 86vh;

    overflow-y: auto;

    position: relative;

    padding: 18px;

    border-radius: 25px;

    border: 1px solid
        rgba(70,220,255,.25);

    background:
        linear-gradient(
            145deg,
            #0c2139,
            #050914
        );

    box-shadow:
        0 -10px 50px
        rgba(0,0,0,.7);

    color: #fff;
}


.closex {

    position: absolute;

    right: 13px;

    top: 8px;

    width: 35px;

    height: 35px;

    border: 0;

    border-radius: 50%;

    background:
        rgba(255,255,255,.06);

    color: #fff;

    font-size: 25px;

    line-height: 1;

    cursor: pointer;
}


.daily-title {

    display: flex;

    align-items: center;

    gap: 11px;

    margin-bottom: 15px;

    padding-right: 30px;
}


.daily-icon {

    width: 48px;

    height: 48px;

    flex: 0 0 48px;

    display: flex;

    align-items: center;

    justify-content: center;

    border-radius: 15px;

    background:
        linear-gradient(
            145deg,
            rgba(45,220,255,.18),
            rgba(90,70,255,.12)
        );

    border: 1px solid
        rgba(80,220,255,.2);

    font-size: 25px;
}


.daily-title small {

    display: block;

    color: #6de5ff;

    font-size: 8px;

    letter-spacing: 1.7px;

    font-weight: 800;
}


.daily-title h2 {

    margin: 3px 0;

    font-size: 21px;
}


.daily-title p {

    margin: 0;

    color: #8da7b9;

    font-size: 10px;
}


/* =====================================================
   DAYS
===================================================== */

.days-grid {

    display: grid;

    grid-template-columns:
        repeat(5, 1fr);

    gap: 6px;
}


.day {

    position: relative;

    min-height: 54px !important;

    height: 54px !important;

    padding: 4px;

    border-radius: 12px;

    border: 1px solid
        rgba(255,255,255,.09);

    background:
        rgba(255,255,255,.045);

    color: #fff;

    display: flex;

    flex-direction: column;

    align-items: center;

    justify-content: center;

    transition:
        .15s ease;

    font-family: inherit;
}


.day b {

    font-size: 8px;

    line-height: 10px;

    color: #a6bac6;
}


.day strong {

    margin-top: 2px;

    font-size: 11px;

    line-height: 13px;
}


.day strong small {

    margin-left: 2px;

    color: #7cff9b;

    font-size: 7px;
}


.day-check {

    position: absolute;

    right: 3px;

    top: 3px;

    width: 14px;

    height: 14px;

    display: flex;

    align-items: center;

    justify-content: center;

    border-radius: 50%;

    font-size: 9px;

    font-weight: 900;
}


/* claimed */

.day.claimed {

    border-color:
        rgba(73,232,120,.9) !important;

    background:
        linear-gradient(
            145deg,
            rgba(65,190,105,.23),
            rgba(20,80,50,.15)
        ) !important;

    box-shadow:
        0 0 14px
        rgba(80,255,150,.16);
}


.day.claimed b {

    color: #7cff9b;
}


.day.claimed strong {

    color: #dffff0;
}


.day.claimed
.day-check {

    background:
        #49e878;

    color:
        #04150b;

    box-shadow:
        0 0 8px
        rgba(73,232,120,.75);
}


/* current */

.day.current {

    border-color:
        rgba(54,229,255,.95) !important;

    background:
        rgba(30,190,235,.09);

    box-shadow:
        0 0 15px
        rgba(33,223,255,.24);

    animation:
        dailyPulse 1.7s infinite;

    cursor: pointer;
}


.day.current b {

    color: #6de5ff;
}


.day.current strong {

    color: #fff;
}


@keyframes dailyPulse {

    0%,
    100% {

        box-shadow:
            0 0 8px
            rgba(33,223,255,.12);
    }

    50% {

        box-shadow:
            0 0 20px
            rgba(33,223,255,.35);
    }
}


/* previous */

.day.previous {

    opacity: .42;
}


.day:disabled {

    cursor: default;
}


/* =====================================================
   DAILY MESSAGE
===================================================== */

.daily-message {

    margin-top: 12px;

    padding: 10px;

    border-radius: 12px;

    text-align: center;

    background:
        rgba(255,255,255,.045);

    border: 1px solid
        rgba(255,255,255,.06);

    color: #9db3c0;

    font-size: 10px;
}


.daily-loading {

    grid-column:
        1 / -1;

    text-align: center;

    padding: 35px 10px;

    color: #8da7b9;

    font-size: 11px;
}


.daily-error {

    grid-column:
        1 / -1;

    text-align: center;

    padding: 30px 10px;

    border-radius: 15px;

    background:
        rgba(255,80,80,.05);

    border: 1px solid
        rgba(255,100,100,.15);

    color: #ffb0b0;

    font-size: 11px;
}


.daily-error small {

    color: #8da7b9;

    font-size: 9px;
}


/* =====================================================
   DAILY GIFT BUTTON
===================================================== */

#dailyGift {

    position: absolute;

    z-index: 20;

    left: 8px;

    bottom: 78px;

    width: 62px;

    height: 62px;

    padding: 0;

    border-radius: 20px;

    border: 1px solid
        rgba(69,232,255,.35);

    background:
        linear-gradient(
            145deg,
            #102f4d,
            #07101e
        );

    color: #fff;

    box-shadow:
        0 0 25px
        rgba(32,223,255,.16);

    display: flex;

    flex-direction: column;

    align-items: center;

    justify-content: center;
}


#dailyGift .gift {

    font-size: 25px;
}


#dailyGift span {

    font-size: 9px;
}


/* =====================================================
   WALLET
===================================================== */

.wallet-card {

    position: relative;
}


#ton-connect {

    min-height: 48px;
}


#walletAddress {

    font-size: 11px;

    font-family: monospace;
}


/* =====================================================
   TOAST
===================================================== */

#sinapsToast {

    position: fixed;

    left: 50%;

    bottom: 90px;

    transform:
        translateX(-50%);

    z-index: 100000;

    display: none;

    background:
        #091729;

    border: 1px solid
        rgba(54,220,255,.35);

    border-radius: 14px;

    padding: 11px 15px;

    color: #fff;

    font-size: 12px;

    max-width: 90%;

    text-align: center;

    box-shadow:
        0 10px 35px
        rgba(0,0,0,.55);
}


#sinapsToast.ok {

    border-color:
        rgba(124,255,155,.55);
}


/* =====================================================
   MOBILE
===================================================== */

@media(max-width:380px) {

    .daily-modal-box {

        padding: 14px;

    }

    .days-grid {

        gap: 5px;

    }

    .day {

        min-height: 51px !important;

        height: 51px !important;

        border-radius: 10px;

    }

    .day b {

        font-size: 7px;

    }

    .day strong {

        font-size: 10px;

    }
}

`;

    document.head.appendChild(s);
}


/* =========================================================
   DAILY BUTTON
========================================================= */

function prepareDailyButton() {

    const gift =
        $('dailyGift');

    if (!gift) {

        console.log(
            'dailyGift button not found'
        );

        return;
    }

    /*
     * جلوگیری از چند بار ثبت شدن click
     */

    gift.onclick =
        null;

    gift.addEventListener(
        'click',
        e => {

            e.preventDefault();

            openDaily();

        }
    );
}


/* =========================================================
   START
========================================================= */

async function start() {

    load();

    telegram();

    css();

    prepareDailyButton();

    nav();

    tap();

    startEnergy();

    render();

    /*
     * ابتدا Telegram user
     */

    await loadUser();

    /*
     * سپس Wallet
     */

    await setupWallet();

    /*
     * سپس Withdraw
     */

    await setupWithdraw();
}


if (
    document.readyState ===
    'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        start
    );

} else {

    start();
}

})();
