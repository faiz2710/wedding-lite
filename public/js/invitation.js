/* =====================================================================
   ALIF & INDY — INVITATION SCRIPT (vanilla JS)
   Opening amplop → hero ayat → section undangan. Setiap fitur
   dibungkus safe() agar satu error tidak merusak fitur lain.
   ===================================================================== */

(function () {
    "use strict";

    // Tanda untuk jaring pengaman di Blade (jika file ini gagal dimuat).
    window.__invitationReady = true;

    var $ = function (selector, context) {
        return (context || document).querySelector(selector);
    };

    var $$ = function (selector, context) {
        return Array.prototype.slice.call((context || document).querySelectorAll(selector));
    };

    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    var guestName = "";
    var csrfToken = "";
    var csrfRequest = null;

    function getCsrfToken() {
        if (csrfToken) {
            return Promise.resolve(csrfToken);
        }

        if (!csrfRequest) {
            csrfRequest = fetch("/api/csrf", { credentials: "same-origin" })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("csrf");
                    }

                    return response.json();
                })
                .then(function (data) {
                    csrfRequest = null;
                    csrfToken = data.token || "";

                    return csrfToken;
                })
                .catch(function (error) {
                    csrfRequest = null;
                    throw error;
                });
        }

        return csrfRequest;
    }

    function safe(fn) {
        try {
            fn();
        } catch (error) {
            if (window.console) {
                console.error("[invitation]", error);
            }
        }
    }

    /* -----------------------------------------------------------------
       1. PERSONALISASI NAMA TAMU
       Contoh: /invitation?to=Zia%20Kirana
       ----------------------------------------------------------------- */

    function setupGuest() {
        var params = new URLSearchParams(window.location.search);

        guestName = (params.get("to") || "").trim().slice(0, 100);

        if (!guestName) {
            return;
        }

        var openingGuest = $("#openingGuest");

        if (openingGuest) {
            openingGuest.textContent = guestName;
        }

        ["#name", "#wishesName"].forEach(function (selector) {
            var input = $(selector);

            if (input && !input.value) {
                input.value = guestName;
            }
        });
    }

    /* -----------------------------------------------------------------
       2. MUSIK (hanya dimulai setelah tindakan pengguna)
       Aktif hanya jika $musicSrc diisi di Blade.
       ----------------------------------------------------------------- */

    var audio = null;

    function setupMusic() {
        audio = $("#bgMusic");
        var toggle = $("#musicToggle");

        if (audio) {
            audio.volume = 0.6;
        }

        if (!audio || !toggle) {
            return;
        }

        function sync() {
            var playing = !audio.paused;

            toggle.setAttribute("aria-pressed", playing ? "true" : "false");
            toggle.setAttribute("aria-label", playing ? "Jeda musik" : "Putar musik");
        }

        toggle.addEventListener("click", function () {
            if (audio.paused) {
                startMusic();
            } else {
                audio.pause();
            }

            sync();
        });

        audio.addEventListener("play", sync);
        audio.addEventListener("pause", sync);

        sync();
    }

    function startMusic() {
        if (!audio) {
            return;
        }

        var attempt = audio.play();
        if (attempt && attempt.catch) {
            attempt.catch(function () {});
        }
    }

    /* -----------------------------------------------------------------
       3. OPENING AMPLOP
       - Dilewati otomatis bila halaman dimuat ulang setelah RSVP.
       - Tombol "Lewati animasi" dan tombol Escape langsung membuka.
       ----------------------------------------------------------------- */

    function setupOpening() {
        var body = document.body;
        var opening = $("#opening");
        var main = $("#main");
        var rsvpState = body.getAttribute("data-rsvp-state") || "none";
        var lockTargets = [main].filter(Boolean);

        function setInert(value) {
            lockTargets.forEach(function (element) {
                element.inert = value;
            });
        }

        function enterSite() {
            body.classList.remove("is-locked");
            setInert(false);
            body.classList.add("is-entered");

            var hash = window.location.hash;
            var target = hash && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;

            if (target) {
                target.scrollIntoView({ block: "start" });
            } else if (rsvpState === "none") {
                window.scrollTo(0, 0);
                var title = $("#heroTitle");
                if (title) {
                    title.focus({ preventScroll: true });
                }
            }
        }

        // Tanpa opening, atau kembali dari pengiriman RSVP: langsung masuk.
        if (!opening || rsvpState !== "none") {
            if (opening) {
                opening.classList.add("is-gone");
            }
            enterSite();
            return;
        }

        var openButton = $("#openInvitation");
        var skipButton = $("#skipOpening");
        var seal = $("#sealButton");
        var envelope = $("#envelope");
        var started = false;

        body.classList.add("is-locked");
        setInert(true);

        if (openButton) {
            openButton.focus({ preventScroll: true });
        }

        function leave() {
            opening.classList.add("is-leaving");
            enterSite();

            window.setTimeout(function () {
                opening.classList.add("is-gone");
            }, 900);
        }

        function begin(animated) {
            if (started) {
                return;
            }

            started = true;
            startMusic();

            if (!animated || reducedMotion.matches || !envelope) {
                leave();
                return;
            }

            opening.classList.add("is-opening");
            envelope.classList.add("is-open");

            window.setTimeout(leave, 1750);
        }

        if (openButton) {
            openButton.addEventListener("click", function () {
                begin(true);
            });
        }

        if (seal) {
            seal.addEventListener("click", function () {
                begin(true);
            });
        }

        if (skipButton) {
            skipButton.addEventListener("click", function () {
                begin(false);
            });
        }

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !started) {
                begin(false);
            }
        });
    }

    /* -----------------------------------------------------------------
       4. REVEAL SAAT SCROLL (IntersectionObserver, sekali per elemen)
       ----------------------------------------------------------------- */

    function setupReveal() {
        var items = $$("[data-reveal]");

        if (!items.length) {
            return;
        }

        items.forEach(function (element) {
            var delay = element.getAttribute("data-delay");

            if (delay) {
                element.style.setProperty("--d", delay + "ms");
            }
        });

        if (reducedMotion.matches || !("IntersectionObserver" in window)) {
            items.forEach(function (element) {
                element.classList.add("is-visible");
            });

            return;
        }

        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
        );

        items.forEach(function (element) {
            observer.observe(element);
        });
    }

    /* -----------------------------------------------------------------
       5. NAVIGASI: ANCHOR HALUS + PENANDA SECTION AKTIF
       ----------------------------------------------------------------- */

    function setupAnchors() {
        $$('a[href^="#"]').forEach(function (link) {
            link.addEventListener("click", function (event) {
                var targetId = link.getAttribute("href");

                if (!targetId || targetId === "#") {
                    return;
                }

                var target = document.querySelector(targetId);

                if (!target) {
                    return;
                }

                event.preventDefault();

                target.scrollIntoView({
                    behavior: reducedMotion.matches ? "auto" : "smooth",
                    block: "start"
                });

                if (window.history.replaceState) {
                    window.history.replaceState(null, "", targetId);
                }
            });
        });
    }

    function setupDockActive() {
        var links = $$("[data-dock]");

        if (!links.length || !("IntersectionObserver" in window)) {
            return;
        }

        var map = {};

        links.forEach(function (link) {
            map[link.getAttribute("data-dock")] = link;
        });

        function activate(id) {
            links.forEach(function (link) {
                if (link.getAttribute("data-dock") === id) {
                    link.setAttribute("aria-current", "true");
                } else {
                    link.removeAttribute("aria-current");
                }
            });
        }

        var observer = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting && map[entry.target.id]) {
                        activate(entry.target.id);
                    }
                });
            },
            { rootMargin: "-45% 0px -50% 0px" }
        );

        Object.keys(map).forEach(function (id) {
            var section = document.getElementById(id);

            if (section) {
                observer.observe(section);
            }
        });

        activate("ayat");
    }

    /* -----------------------------------------------------------------
       6. COUNTDOWN — target dibaca dari data-deadline di Blade
       ----------------------------------------------------------------- */

    function setupCountdown() {
        var countdown = $("#countdownTimer");

        if (!countdown) {
            return;
        }

        var deadline = new Date(countdown.getAttribute("data-deadline") || "").getTime();

        if (isNaN(deadline)) {
            return;
        }

        var days = $("#days");
        var hours = $("#hours");
        var minutes = $("#minutes");
        var seconds = $("#seconds");
        var timer = null;

        function setValue(element, value) {
            if (element && element.textContent !== value) {
                element.textContent = value;
            }
        }

        function update() {
            var difference = deadline - Date.now();

            if (difference <= 0) {
                setValue(days, "000");
                setValue(hours, "00");
                setValue(minutes, "00");
                setValue(seconds, "00");

                countdown.setAttribute("aria-label", "Hari pernikahan telah tiba");

                if (timer) {
                    window.clearInterval(timer);
                }

                return;
            }

            setValue(days, String(Math.floor(difference / 86400000)).padStart(3, "0"));
            setValue(hours, String(Math.floor((difference / 3600000) % 24)).padStart(2, "0"));
            setValue(minutes, String(Math.floor((difference / 60000) % 60)).padStart(2, "0"));
            setValue(seconds, String(Math.floor((difference / 1000) % 60)).padStart(2, "0"));
        }

        update();
        timer = window.setInterval(update, 1000);
    }

    /* -----------------------------------------------------------------
       7. SIMPAN KE KALENDER (.ics dibuat di browser dari kartu acara)
       ----------------------------------------------------------------- */

    function setupCalendar() {
        var button = $("#addToCalendar");
        var cards = $$("[data-event]");

        if (!button || !cards.length) {
            return;
        }

        function stamp(date) {
            return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
        }

        function escapeText(value) {
            return String(value)
                .replace(/\\/g, "\\\\")
                .replace(/([,;])/g, "\\$1")
                .replace(/\r?\n/g, "\\n");
        }

        button.addEventListener("click", function () {
            var now = stamp(new Date());

            var lines = [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "PRODID:-//Alif & Indy//Wedding Invitation//ID",
                "CALSCALE:GREGORIAN"
            ];

            cards.forEach(function (card) {
                var start = new Date(card.getAttribute("data-start"));
                var end = new Date(card.getAttribute("data-end"));

                if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                    return;
                }

                lines.push(
                    "BEGIN:VEVENT",
                    "UID:" + card.getAttribute("data-event") + "-" + stamp(start) + "@wedding-alif-indy",
                    "DTSTAMP:" + now,
                    "DTSTART:" + stamp(start),
                    "DTEND:" + stamp(end),
                    "SUMMARY:" + escapeText(card.getAttribute("data-title") || "Pernikahan Alif & Indy"),
                    "END:VEVENT"
                );
            });

            lines.push("END:VCALENDAR");

            var blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var link = document.createElement("a");

            link.href = url;
            link.download = "alif-indy-wedding.ics";
            document.body.appendChild(link);
            link.click();
            link.remove();

            window.setTimeout(function () {
                URL.revokeObjectURL(url);
            }, 1500);
        });
    }

    /* -----------------------------------------------------------------
        7b. SALIN NOMOR REKENING ([data-copy])
        ----------------------------------------------------------------- */

    function setupCopy() {
        var buttons = $$("[data-copy]");

        if (!buttons.length) {
            return;
        }

        buttons.forEach(function (button) {
            button.addEventListener("click", function () {
                var text = button.getAttribute("data-copy");
                var label = button.innerHTML;

                function done() {
                    button.textContent = "Tersalin!";
                    button.classList.add("is-copied");

                    window.setTimeout(function () {
                        button.innerHTML = label;
                        button.classList.remove("is-copied");
                    }, 1600);
                }

                function fallback() {
                    var input = document.createElement("textarea");

                    input.value = text;
                    input.style.position = "fixed";
                    input.style.opacity = "0";

                    document.body.appendChild(input);
                    input.select();
                    document.execCommand("copy");
                    input.remove();

                    done();
                }

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text).then(done, fallback);
                } else {
                    fallback();
                }
            });
        });
    }

    /* -----------------------------------------------------------------
        7c. SLIDESHOW MOMEN (#momentSlides)
        Auto berganti tiap 4,5 detik, ada tombol prev/next & dots.
        ----------------------------------------------------------------- */

    function setupSlideshow() {
        var container = $("#momentSlides");
        var prev = $("#slidesPrev");
        var next = $("#slidesNext");
        var dots = $("#slidesDots");

        if (!container || !container.children.length) {
            return;
        }

        var slides = $$(".moment-slide", container);
        var index = 0;
        var timer = null;
        var delay = 4500;

        // Satu foto (atau tanpa navigasi) tidak perlu timer/dots.
        if (slides.length < 2) {
            if (slides[0]) {
                slides[0].classList.add("is-active");
            }

            return;
        }

        // Titik navigasi dibuat mengikuti jumlah slide (jika wadahnya ada)
        var dotElements = [];

        if (dots) {
            dotElements = slides.map(function (_, i) {
                var dot = document.createElement("button");

                dot.type = "button";
                dot.className = "moments__dot";
                dot.setAttribute("aria-label", "Foto " + (i + 1));

                dot.addEventListener("click", function () {
                    goTo(i);
                });

                dots.appendChild(dot);

                return dot;
            });
        }

        function render() {
            slides.forEach(function (slide, i) {
                slide.classList.toggle("is-active", i === index);

                // hidden tidak dipakai agar transisi fade berjalan mulus
                slide.style.pointerEvents = i === index ? "auto" : "none";
                slide.setAttribute("aria-hidden", i === index ? "false" : "true");
            });

            dotElements.forEach(function (dot, i) {
                dot.classList.toggle("is-active", i === index);
            });
        }

        function goTo(target) {
            index = (target + slides.length) % slides.length;
            render();
            restart();
        }

        function restart() {
            if (timer) {
                window.clearInterval(timer);
            }

            if (!reducedMotion.matches) {
                timer = window.setInterval(function () {
                    goTo(index + 1);
                }, delay);
            }
        }

        if (prev) {
            prev.addEventListener("click", function () {
                goTo(index - 1);
            });
        }

        if (next) {
            next.addEventListener("click", function () {
                goTo(index + 1);
            });
        }

        // Hentikan auto-play saat pengguna sedang melihat tab lain
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                if (timer) {
                    window.clearInterval(timer);
                    timer = null;
                }
            } else {
                restart();
            }
        });

        render();
        restart();
    }

    /* -----------------------------------------------------------------
       7d. DAFTAR UCAPAN (API) — 30 terbaru di atas
       ----------------------------------------------------------------- */

    function formatWishDate(iso) {
        var date = new Date(iso);

        if (isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function renderWishes(wishes) {
        var list = $("#wishesList");

        if (!list) {
            return;
        }

        var empty = $("#wishesEmpty");
        var items = Array.isArray(wishes) ? wishes.slice(0, 30) : [];

        $$(".wish-card", list).forEach(function (card) {
            card.remove();
        });

        if (empty) {
            empty.hidden = items.length > 0;
        }

        items.forEach(function (wish) {
            var article = document.createElement("article");
            article.className = "wish-card is-visible";

            var head = document.createElement("header");
            head.className = "wish-card__head";

            var name = document.createElement("p");
            name.className = "wish-card__name";
            name.textContent = wish.name;

            var time = document.createElement("time");
            time.className = "wish-card__date";
            time.dateTime = wish.created_at;
            time.textContent = formatWishDate(wish.created_at);

            var message = document.createElement("p");
            message.className = "wish-card__message";
            message.textContent = wish.message;

            head.appendChild(name);
            head.appendChild(time);
            article.appendChild(head);
            article.appendChild(message);
            list.appendChild(article);
        });
    }

    function loadWishes() {
        return fetch("/api/wishes", { credentials: "same-origin" })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("wishes");
                }

                return response.json();
            })
            .then(function (data) {
                renderWishes(data.wishes);
            })
            .catch(function (error) {
                if (window.console) {
                    console.error("[invitation]", error);
                }
            });
    }

    function collectErrors(kind, form) {
        var errors = [];
        var name;
        var message;

        if (kind === "wishes") {
            name = form.elements["wishes[name]"].value.trim();
            message = form.elements["wishes[message]"].value.trim();

            if (name === "") {
                errors.push("Nama wajib diisi.");
            } else if (name.length > 100) {
                errors.push("Nama maksimal 100 karakter.");
            }

            if (message === "") {
                errors.push("Ucapan tidak boleh kosong.");
            } else if (message.length > 500) {
                errors.push("Ucapan maksimal 500 karakter.");
            }

            return errors;
        }

        var attendance = form.elements.attendance.value;
        var guests = parseInt(form.elements.guests.value, 10);
        name = form.elements.name.value.trim();
        message = form.elements.message.value.trim();

        if (name === "") {
            errors.push("Nama tamu wajib diisi.");
        } else if (name.length > 100) {
            errors.push("Nama maksimal 100 karakter.");
        }

        if (attendance === "" || (attendance !== "hadir" && attendance !== "tidak_hadir")) {
            errors.push("Silakan pilih konfirmasi kehadiran.");
        }

        if (isNaN(guests)) {
            errors.push("Jumlah tamu harus berupa angka.");
        } else if (guests < 1) {
            errors.push("Jumlah tamu minimal 1 orang.");
        } else if (guests > 10) {
            errors.push("Jumlah tamu maksimal 10 orang.");
        }

        if (message !== "" && message.length > 1000) {
            errors.push("Pesan maksimal 1000 karakter.");
        }

        return errors;
    }

    function showFormAlert(kind, status, messages) {
        var alert = $('.form-alert--' + status + '[data-feedback="' + kind + '"]');

        $$('.form-alert[data-feedback="' + kind + '"]').forEach(function (element) {
            element.hidden = true;
        });

        if (!alert) {
            return;
        }

        if (status === "success") {
            var text = $(".form-alert__message", alert);

            if (text) {
                text.textContent = messages[0];
            }
        } else {
            var list = $("ul", alert);

            if (list) {
                list.textContent = "";
                messages.forEach(function (msg) {
                    var item = document.createElement("li");
                    item.textContent = msg;
                    list.appendChild(item);
                });
            }
        }

        alert.hidden = false;
        alert.scrollIntoView({ block: "center" });
        alert.focus({ preventScroll: true });
    }

    /* -----------------------------------------------------------------
       8. FORM (RSVP & WISHES) — stepper, validasi, kirim ke API
       ----------------------------------------------------------------- */

    function setupForms() {
        // Stepper jumlah orang (_RSVP)
        var attendance = $("#attendance");
        var guests = $("#guests");
        var hint = $("#guestsHint");
        var stepButtons = $$(".stepper__btn");
        var defaultHint = hint ? hint.textContent : "";

        if (guests) {
            stepButtons.forEach(function (button) {
                button.addEventListener("click", function () {
                    if (guests.readOnly) {
                        return;
                    }

                    var step = parseInt(button.getAttribute("data-step"), 10) || 0;
                    var min = parseInt(guests.min, 10) || 1;
                    var max = parseInt(guests.max, 10) || 10;
                    var current = parseInt(guests.value, 10);

                    if (isNaN(current)) {
                        current = min;
                    }

                    guests.value = Math.min(max, Math.max(min, current + step));
                });
            });
        }

        // Jika tidak hadir, jumlah orang dikunci di 1 (sesuai validasi backend).
        function syncAttendance() {
            if (!attendance || !guests) {
                return;
            }

            var absent = attendance.value === "tidak_hadir";

            if (absent) {
                guests.value = "1";
            }

            guests.readOnly = absent;

            stepButtons.forEach(function (button) {
                button.disabled = absent;
            });

            if (hint) {
                hint.textContent = absent
                    ? "Cukup 1 orang untuk konfirmasi ketidakhadiran."
                    : defaultHint;
            }
        }

        if (attendance) {
            attendance.addEventListener("change", syncAttendance);
            syncAttendance();
        }

        // Kirim form ke API (validasi ulang di server, CSRF via header).
        $$(".invite-form").forEach(function (form) {
            var kind = form.id === "wishesForm" ? "wishes" : "rsvp";
            var submit = form.querySelector(".button--submit");
            var label = submit ? submit.querySelector(".button__label") : null;
            var endpoint = kind === "wishes" ? "/api/wishes" : "/api/rsvp";

            if (!submit) {
                return;
            }

            var originalLabel = submit.getAttribute("data-label") || (label ? label.textContent : "");

            function setLoading(loading) {
                submit.classList.toggle("is-loading", loading);

                if (loading) {
                    submit.setAttribute("aria-busy", "true");
                } else {
                    submit.removeAttribute("aria-busy");
                }

                if (label) {
                    label.textContent = loading ? "Mengirim..." : originalLabel;
                }
            }

            form.addEventListener("submit", function (event) {
                event.preventDefault();

                if (submit.classList.contains("is-loading")) {
                    return;
                }

                var errors = collectErrors(kind, form);

                if (errors.length) {
                    showFormAlert(kind, "error", errors);
                    return;
                }

                var payload = kind === "wishes"
                    ? {
                        name: form.elements["wishes[name]"].value.trim(),
                        message: form.elements["wishes[message]"].value.trim()
                    }
                    : {
                        name: form.elements.name.value.trim(),
                        attendance: form.elements.attendance.value,
                        guests: parseInt(form.elements.guests.value, 10),
                        message: form.elements.message.value.trim()
                    };

                setLoading(true);

                getCsrfToken()
                    .then(function (token) {
                        return fetch(endpoint, {
                            method: "POST",
                            credentials: "same-origin",
                            headers: {
                                "Content-Type": "application/json",
                                "X-CSRF-Token": token
                            },
                            body: JSON.stringify(payload)
                        });
                    })
                    .then(function (response) {
                        return response.json().then(function (data) {
                            return { ok: response.ok, status: response.status, data: data };
                        });
                    })
                    .then(function (result) {
                        if (!result.ok || !result.data.ok) {
                            if (result.status === 419) {
                                csrfToken = "";
                            }

                            throw {
                                messages: result.data.errors || [result.data.message || "Gagal mengirim. Coba lagi."]
                            };
                        }

                        return result.data;
                    })
                    .then(function (data) {
                        setLoading(false);
                        form.reset();

                        var nameInput = form.elements[kind === "wishes" ? "wishes[name]" : "name"];

                        if (nameInput && guestName) {
                            nameInput.value = guestName;
                        }

                        if (kind === "rsvp") {
                            syncAttendance();
                        } else {
                            renderWishes(data.wishes);
                        }

                        showFormAlert(kind, "success", [data.message]);
                    })
                    .catch(function (error) {
                        setLoading(false);
                        showFormAlert(
                            kind,
                            "error",
                            error && error.messages
                                ? error.messages
                                : ["Gagal mengirim. Periksa koneksi lalu coba lagi."]
                        );
                    });
            });
        });
    }

    /* -----------------------------------------------------------------
       JALANKAN
       ----------------------------------------------------------------- */

    function init() {
        safe(setupGuest);
        safe(setupMusic);
        safe(setupOpening);
        safe(loadWishes);
        safe(setupReveal);
        safe(setupAnchors);
        safe(setupDockActive);
        safe(setupCountdown);
        safe(setupCalendar);
        safe(setupCopy);
        safe(setupSlideshow);
        safe(setupForms);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
