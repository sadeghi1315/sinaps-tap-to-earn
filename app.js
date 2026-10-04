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

const WALLET_OWNER_KEY = 'sinaps_wallet_owner_v2';
const LOCAL_STATE_KEY = 'sinaps_v8';

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
    return String(s ?? '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[c]));
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

    if (options.body && typeof options.body === 'string') {
        try {
            const b = JSON.parse(options.body);

            b.init_data = initData;

            options.body = JSON.stringify(b);

        } catch {}
    }

    const r = await fetch(API + path, options);

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

    user = tg.initDataUnsafe?.user || null;
    initData = tg.initData || '';

    if (!user) {
        return;
    }

    if ($('username')) {
        $('username').textContent =
            user.username
                ? '@' + user.username
                : (user.first_name || 'SINAPS User');
    }

    if ($('avatarLetter')) {
        $('avatarLetter').textContent =
            (user.first_name ||
             user.username ||
             'S').charAt(0).toUpperCase();
    }

    if (user.photo_url && $('userAvatar')) {

        $('userAvatar').src = user.photo_url;

        $('userAvatar').style.display = 'block';

        if ($('avatarLetter')) {
            $('avatarLetter').style.display = 'none';
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
            localStorage.getItem(LOCAL_STATE_KEY) || '{}'
        );

        if (Number.isFinite(+x.balance)) {
            balance = +x.balance;
        }

        if (Number.isFinite(+x.energy)) {
            energy = +x.energy;
        }

        if (Number.isFinite(+x.maxEnergy)) {
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
            Math.max(0, Math.floor(balance))
            .toLocaleString();
    }

    if ($('energy')) {
        $('energy').textContent =
            Math.max(0, Math.floor(energy)) +
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

        const d = await api(
            '/api/user',
            {
                method: 'POST',
                body: JSON.stringify({
                    telegram_id: user.id,
                    username:
                        user.username ||
                        user.first_name ||
                        '',
                    start_param:
                        tg?.initDataUnsafe?.start_param ||
                        ''
                })
            }
        );

        const u = d.user || {};

        if (!pending) {

            balance =
                Number(u.balance || 0);

            energy =
                Number(u.energy || 0);

            maxEnergy =
                Number(u.max_energy || 1000);

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
                telegram_id: user.id
            })
        }
    );
}


async function processTaps() {

    if (processing || !queue) {
        return;
    }

    processing = true;

    while (queue) {

        try {

            const d = await sendTap();

            queue--;
            pending--;

            if (!pending && !queue) {

                const u = d.user || {};

                balance =
                    Number(u.balance ?? balance);

                energy =
                    Number(u.energy ?? energy);

                maxEnergy =
                    Number(u.max_energy ?? maxEnergy);

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
        setTimeout(processTaps, 500);
    }
}


function tap() {

    const a = $('tapArea');

    if (!a) {
        return;
    }

    a.addEventListener(
        'pointerdown',
        e => {

            e.preventDefault();

            if (!user?.id || energy <= 0) {
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
                document.createElement('div');

            f.className = 'floater';

            f.textContent = '+1';

            f.style.left =
                (e.clientX - r.left) + 'px';

            f.style.top =
                (e.clientY - r.top) + 'px';

            $('floaters')?.appendChild(f);

            setTimeout(() => {
                f.remove();
            }, 700);

            $('sCoin')?.classList.add('hit');

            setTimeout(() => {
                $('sCoin')?.classList.remove('hit');
            }, 120);

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

    clearInterval(energyTimer);

    energyTimer =
        setInterval(() => {

            if (energy < maxEnergy) {

                energy++;

                render();
                save();
            }

        }, 3000);
}


/* =========================================================
   NAVIGATION
========================================================= */

function showPage(page) {

    document
        .querySelectorAll('.page')
        .forEach(p => {
            p.classList.remove('active');
        });

    const target =
        document.getElementById(
            'page-' + page
        );

    if (target) {
        target.classList.add('active');
    }

    document
        .querySelectorAll('.bottom-nav button')
        .forEach(b => {

            b.classList.toggle(
                'active',
                b.dataset.page === page
            );
        });

    if (page === 'tasks') {
        loadTasks();
    }

    if (page === 'friends') {
        loadFriends();
    }

    if (page === 'wallet') {
        loadHistory();
    }
}


function nav() {

    document
        .querySelectorAll(
            '.bottom-nav button, [data-page]'
        )
        .forEach(b => {

            if (b.dataset.boundNav) {
                return;
            }

            b.dataset.boundNav = '1';

            b.addEventListener(
                'click',
                () => {

                    const page =
                        b.dataset.page;

                    if (page) {
                        showPage(page);
                    }
                }
            );
        });
}


/* =========================================================
   DAILY
========================================================= */

async function openDaily() {

    let modal =
        $('dailyModal');

    if (!modal) {

        modal =
            document.createElement('div');

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
                    <small>DAILY STREAK</small>
                    <h2>Daily Reward</h2>
                </div>

                <div
                    id="daysGrid"
                    class="days-grid">
                </div>

                <div
                    id="dailyMsg"
                    class="muted">
                </div>

            </div>
        `;

        document.body.appendChild(modal);

        $('closeDaily').onclick =
            () => modal.classList.remove('show');

        modal.onclick = e => {

            if (e.target === modal) {
                modal.classList.remove('show');
            }
        };
    }

    modal.classList.add('show');

    try {

        const d =
            await api(
                '/api/daily?telegram_id=' +
                user.id,
                {
                    headers: {}
                }
            );

        const daily =
            d.daily || {};

        const streak =
            Number(daily.streak || 0);

        const last =
            daily.last_claim_date || null;

        const today =
            new Date()
                .toISOString()
                .slice(0, 10);

        const claimedToday =
            last === today;

        let html = '';

        for (let i = 1; i <= 30; i++) {

            /*
             * فقط روزی که امروز واقعاً دریافت شده
             * تیک سبز می‌گیرد.
             */
            const claimed =
                claimedToday &&
                i === streak;

            /*
             * روز بعدی که باید دریافت شود
             */
            const current =
                !claimedToday &&
                i === Math.min(streak + 1, 30);

            /*
             * روزهای قبلی
             */
            const previous =
                i < streak;

            html += `
                <button
                    class="day
                        ${current ? 'current' : ''}
                        ${claimed ? 'claimed' : ''}
                        ${previous ? 'previous' : ''}"
                    data-day="${i}"
                    ${current ? '' : 'disabled'}>

                    <b>Day ${i}</b>

                    <small>
                        ${i * 10} SNP
                    </small>

                    <span class="day-check">
                        ${claimed ? '✓' : ''}
                    </span>

                </button>
            `;
        }

        $('daysGrid').innerHTML = html;

        const currentButton =
            $('daysGrid')
                .querySelector('.day.current');

        if (currentButton) {
            currentButton.onclick =
                claimDaily;
        }

        if (claimedToday) {

            $('dailyMsg').textContent =
                `Day ${streak} received ✓ — Come back tomorrow.`;

        } else {

            const nextDay =
                Math.min(streak + 1, 30);

            $('dailyMsg').textContent =
                `Day ${nextDay} is ready to claim.`;
        }

    } catch (e) {

        $('dailyMsg').textContent =
            e.message;
    }
}


async function claimDaily(e) {

    const b =
        e.currentTarget;

    b.disabled = true;

    try {

        const d =
            await api(
                '/api/daily/claim',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        telegram_id: user.id
                    })
                }
            );

        balance =
            Number(d.user.balance);

        render();
        save();

        notify(
            'Day ' +
            d.day +
            ' claimed: +' +
            d.reward +
            ' SNP',
            true
        );

        await openDaily();

    } catch (x) {

        b.disabled = false;

        notify(x.message);
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
            await api('/api/tasks');

        const list =
            d.tasks || [];

        box.innerHTML =
            list.map(t => {

                let icon = '💎';

                if (t.id === 'channel') {
                    icon = '📢';
                }

                if (t.id === 'group') {
                    icon = '👥';
                }

                if (t.id === 'twitter') {
                    icon = '𝕏';
                }

                return `
                    <div class="task-card">

                        <div class="task-icon">
                            ${icon}
                        </div>

                        <div class="task-main">

                            <b>${esc(t.title)}</b>

                            <small>
                                +${Number(t.reward).toLocaleString()}
                                SNP
                            </small>

                        </div>

                        <button
                            class="task-btn"
                            data-task="${esc(t.id)}"
                            data-url="${esc(t.url || '')}">
                            Check
                        </button>

                    </div>
                `;

            }).join('');

        box
            .querySelectorAll('.task-btn')
            .forEach(b => {

                b.onclick =
                    () => claimTask(b);
            });

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

    btn.disabled = true;

    try {

        if (btn.dataset.url) {
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
                        telegram_id: user.id,
                        task_id: id
                    })
                }
            );

        balance =
            Number(d.user.balance);

        render();
        save();

        btn.textContent =
            '✓ Done';

        btn.classList.add('done');

        notify(
            'Task completed +' +
            d.reward +
            ' SNP',
            true
        );

    } catch (e) {

        btn.disabled = false;

        btn.textContent =
            'Try again';

        notify(e.message);
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
                user.id,
                {
                    headers: {}
                }
            );

        if ($('inviteCode')) {

            $('inviteCode').textContent =
                d.referral_code || '-';

            $('inviteCode').dataset.code =
                d.referral_code || '';
        }

        if ($('friendsCount')) {

            $('friendsCount').textContent =
                d.referral_count || 0;
        }

        const list =
            d.friends || [];

        if ($('friendsList')) {

            $('friendsList').innerHTML =
                list.length

                ? list.map(f => `
                    <div class="friend-row">
                        <span>
                            ${esc(
                                f.username ||
                                'User'
                            )}
                        </span>

                        <b>
                            ${Number(
                                f.balance || 0
                            ).toLocaleString()}
                            SNP
                        </b>
                    </div>
                `).join('')

                : '<div class="empty">' +
                  'No invited users yet.' +
                  '</div>';
        }

    } catch (e) {

        notify(e.message);
    }
}


window.sinapsCopyInvite =
    async function () {

        try {

            const code =
                $('inviteCode')?.dataset.code ||
                '';

            if (!code) {
                throw new Error(
                    'Referral code not ready.'
                );
            }

            const link =
                'https://t.me/SNPCOINBot?start=' +
                encodeURIComponent(code);

            await navigator.clipboard.writeText(link);

            notify(
                'Invite link copied',
                true
            );

        } catch (e) {

            notify(e.message);
        }
    };


/* =========================================================
   HISTORY
========================================================= */

async function loadHistory() {

    const box =
        $('historyList');

    if (!box || !user) {
        return;
    }

    try {

        const d =
            await api(
                '/api/history?telegram_id=' +
                user.id,
                {
                    headers: {}
                }
            );

        const rows =
            d.transactions || [];

        box.innerHTML =
            rows.length

            ? rows.map(x => {

                const amount =
                    Number(x.amount);

                return `
                    <div class="history-row">

                        <div>

                            <b>
                                ${esc(
                                    String(
                                        x.type || ''
                                    ).replaceAll(
                                        '_',
                                        ' '
                                    )
                                )}
                            </b>

                            <small>
                                ${esc(
                                    x.description || ''
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
                                x.status || ''
                            )}
                        </span>

                    </div>
                `;

            }).join('')

            : '<div class="empty">' +
              'No transactions yet.' +
              '</div>';

    } catch (e) {

        box.textContent =
            e.message;
    }
}


/* =========================================================
   WALLET — IMPORTANT FIX
   Telegram account and wallet are now bound together.
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

    if ($('walletAddress')) {

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


function showConnectedWallet(address) {

    if (!address) {
        clearWalletUI();
        return;
    }

    if ($('walletAddress')) {

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

    if ($('wallet-mini')) {

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

    if (!window.TON_CONNECT_UI) {
        console.log(
            'TON Connect UI not loaded'
        );
        return;
    }

    if (!user?.id) {
        return;
    }

    try {

        /*
         * بسیار مهم:
         *
         * TON Connect روی دستگاه ممکن است Wallet
         * اکانت قبلی Telegram را restore کند.
         *
         * اگر Telegram ID فعلی با مالک Wallet قبلی
         * متفاوت باشد، Wallet قبلی را قطع می‌کنیم.
         */

        const currentOwner =
            walletOwnerKey();

        const previousOwner =
            getSavedWalletOwner();

        tonUI =
            new window.TON_CONNECT_UI.TonConnectUI({
                manifestUrl: MANIFEST,
                buttonRootId: 'ton-connect'
            });

        /*
         * اگر اکانت Telegram عوض شده:
         * Wallet قبلی فقط از دستگاه Disconnect می‌شود.
         *
         * نکته:
         * سرور اکانت قبلی را Disconnect نمی‌کنیم.
         * چون آن Wallet متعلق به همان اکانت قبلی است.
         */

        if (
            previousOwner &&
            currentOwner &&
            previousOwner !== currentOwner
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

            setSavedWalletOwner(null);

            clearWalletUI();
        }


        /*
         * وضعیت اتصال Wallet
         */

        tonUI.onStatusChange(
            async wallet => {

                /*
                 * اگر Wallet وجود ندارد
                 */

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

                /*
                 * اگر Wallet جدید است،
                 * آن را به Telegram ID فعلی متصل می‌کنیم.
                 */

                setSavedWalletOwner(
                    currentOwner
                );

                showConnectedWallet(
                    address
                );

                try {

                    /*
                     * فقط برای اکانت Telegram فعلی
                     */

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
                        'Wallet connected to this Telegram account',
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

        /*
         * اگر دکمه دستی Connect در HTML وجود داشته باشد
         */

        $('connectWalletBtn')?.addEventListener(
            'click',
            () => {

                if (tonUI) {
                    tonUI.openModal();
                }
            }
        );


        /*
         * Disconnect دستی
         */

        $('disconnectWallet')?.addEventListener(
            'click',
            async () => {

                try {

                    await tonUI.disconnect();

                    setSavedWalletOwner(
                        null
                    );

                    clearWalletUI();

                    /*
                     * فقط Wallet همین اکانت
                     * از دیتابیس حذف شود.
                     */

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

                    notify(e.message);
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

            if (withdrawing) {
                return;
            }

            withdrawing = true;

            b.disabled = true;

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
                        $('withdrawAmount')?.value
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

                await tonUI.sendTransaction({

                    validUntil:
                        Math.floor(
                            Date.now() / 1000
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
                });

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

                if ($('withdrawStatus')) {

                    $('withdrawStatus')
                        .textContent =
                        v.status === 'verified'
                            ? 'Payment verified. Processing.'
                            : 'Payment sent. Under review.';
                }

                if ($('withdrawAmount')) {
                    $('withdrawAmount').value = '';
                }

                loadHistory();

                notify(
                    'Withdrawal request created',
                    true
                );

            } catch (e) {

                if ($('withdrawStatus')) {

                    $('withdrawStatus')
                        .textContent =
                        e.message;
                }

                notify(e.message);

            } finally {

                withdrawing = false;

                b.disabled = false;
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
   DAILY / WALLET UI CSS
========================================================= */

function css() {

    const s =
        document.createElement('style');

    s.textContent = `

/* -----------------------------------------
   DAILY
----------------------------------------- */

.daily-modal-box {
    max-width: 430px !important;
    padding: 17px !important;
}

.daily-title {
    text-align: center;
    margin-bottom: 12px;
}

.daily-title small {
    color: #6de5ff;
    letter-spacing: 1.5px;
    font-size: 9px;
}

.daily-title h2 {
    margin: 4px 0 0;
    font-size: 21px;
}


/*
 * Daily boxes smaller
 */

.days-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 6px;
}


/*
 * کوچک‌تر از قبل
 */

.day {
    min-height: 51px !important;
    height: 51px !important;

    border: 1px solid rgba(255,255,255,.10);

    border-radius: 11px;

    background: rgba(255,255,255,.045);

    color: #fff;

    display: flex;

    flex-direction: column;

    align-items: center;

    justify-content: center;

    position: relative;

    padding: 4px;

    transition:
        transform .15s,
        border-color .15s,
        box-shadow .15s;
}

.day b {
    font-size: 9px;
    line-height: 11px;
}

.day small {
    color: #7cff9b;
    font-size: 8px;
    margin-top: 2px;
}

.day span.day-check {
    position: absolute;

    top: 3px;
    right: 4px;

    width: 14px;
    height: 14px;

    border-radius: 50%;

    display: flex;

    align-items: center;
    justify-content: center;

    font-size: 9px;
    font-weight: 900;
}


/*
 * روز دریافت شده
 */

.day.claimed {

    border-color:
        rgba(124,255,155,.9) !important;

    background:
        linear-gradient(
            145deg,
            rgba(65,190,105,.20),
            rgba(20,80,50,.18)
        ) !important;

    box-shadow:
        0 0 13px
        rgba(80,255,150,.18);
}

.day.claimed span.day-check {

    background: #49e878;

    color: #04150b;

    box-shadow:
        0 0 8px
        rgba(73,232,120,.8);
}


/*
 * روز قابل دریافت
 */

.day.current {

    border-color:
        rgba(54,229,255,.9) !important;

    box-shadow:
        0 0 14px
        rgba(33,223,255,.22);

    animation:
        dailyPulse 1.7s infinite;
}

@keyframes dailyPulse {

    0%,100% {
        box-shadow:
            0 0 8px
            rgba(33,223,255,.15);
    }

    50% {
        box-shadow:
            0 0 18px
            rgba(33,223,255,.35);
    }
}

.day.previous {
    opacity: .48;
}

.day:disabled {
    cursor: default;
}

#dailyMsg {
    text-align: center;
    margin-top: 12px;
    font-size: 10px;
}


/* -----------------------------------------
   WALLET
----------------------------------------- */

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

`;


    document.head.appendChild(s);
}


/* =========================================================
   EXTRA UI
========================================================= */

function prepareDailyButton() {

    const gift =
        $('dailyGift');

    if (!gift) {
        return;
    }

    /*
     * اگر قبلاً app.js قدیمی روی صفحه
     * Daily ساخته باشد، دوباره نساز.
     */

    gift.onclick =
        openDaily;
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
     * اول User را مشخص می‌کنیم
     */

    await loadUser();

    /*
     * بعد TON Connect را راه‌اندازی می‌کنیم
     * تا Telegram ID فعلی مشخص باشد.
     */

    await setupWallet();

    await setupWithdraw();
}


if (
    document.readyState === 'loading'
) {

    document.addEventListener(
        'DOMContentLoaded',
        start
    );

} else {

    start();
}

})();
