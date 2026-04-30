(() => {
    const storageKey = "meryl_notifications_read";
    const notifications = [
        {
            title: "Critical Stock Alert",
            message: "Nike Air Max 90 has only 8 units left. Stockout expected in 3 days.",
            time: "1h ago",
            tone: "critical",
            badge: "Critical",
            icon: "stock",
        },
        {
            title: "Low Stock Warning",
            message: "Adidas Ultraboost inventory below reorder point (12 units remaining).",
            time: "2h ago",
            tone: "warning",
            badge: "",
            icon: "stock",
        },
        {
            title: "Promotion Ending Soon",
            message: "Summer Sale ends in 2 days. Current revenue: $28,450.",
            time: "3h ago",
            tone: "notice",
            badge: "",
            icon: "calendar",
        },
        {
            title: "Sales Target Update",
            message: "You've reached 85% of your monthly sales target ($34,200/$40,000).",
            time: "4h ago",
            tone: "plain",
            badge: "",
            icon: "trend",
        },
        {
            title: "Slow-Moving Inventory",
            message: "Formal Oxford and Classic Boot need promotional action this week.",
            time: "5h ago",
            tone: "plain",
            badge: "",
            icon: "trend-down",
        },
    ];

    const createIcon = (type) => {
        const icons = {
            stock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 7.5 12 12l8-4.5L12 3Z"></path><path d="M4 7.5V16.5L12 21V12"></path><path d="M20 7.5V16.5L12 21"></path></svg>',
            calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4"></path><path d="M17 3v4"></path><rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16"></path></svg>',
            trend: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16 10 10l4 4 6-6"></path><path d="M14 8h6v6"></path></svg>',
            "trend-down": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h6l3 8 4-4h3"></path><path d="M20 16v-6"></path></svg>',
            bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17H9"></path><path d="M18 17H6l1.2-1.6A5 5 0 0 0 8 12.4V10a4 4 0 1 1 8 0v2.4a5 5 0 0 0 .8 2.8L18 17Z"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>',
            alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 20H3L12 3Z"></path><path d="M12 9v4"></path><circle cx="12" cy="17" r="1"></circle></svg>',
            close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12"></path><path d="M18 6 6 18"></path></svg>',
        };
        return icons[type] || icons.bell;
    };

    const updateButtonState = (button, read) => {
        if (!button) {
            return;
        }

        const count = button.querySelector("[data-notification-count]");
        button.classList.toggle("is-read", read);
        button.setAttribute(
            "title",
            read ? "Notifications marked as read" : "Mark notifications as read"
        );
        button.setAttribute(
            "aria-label",
            read ? "Notifications marked as read" : "Mark notifications as read"
        );
        if (count) {
            count.textContent = read ? "0" : "4";
        }
    };

    const updatePanelState = (panel, read) => {
        if (!panel) {
            return;
        }

        const newBadge = panel.querySelector("[data-notification-new-badge]");
        if (newBadge) {
            newBadge.textContent = read ? "0 new" : "4 new";
        }

        panel.querySelectorAll("[data-notification-card]").forEach((card, index) => {
            card.classList.toggle("is-muted", read || index >= 4);
        });
    };

    const buildPanelMarkup = () => {
        const cards = notifications
            .map(
                (item) => `
                    <article class="notification-card notification-card-${item.tone}" data-notification-card>
                        <button type="button" class="notification-card-close" aria-label="Dismiss notification">
                            ${createIcon("close")}
                        </button>
                        <div class="notification-card-head">
                            <span class="notification-card-icon">${createIcon(item.icon)}</span>
                            <h3>${item.title}</h3>
                        </div>
                        <p>${item.message}</p>
                        <div class="notification-card-foot">
                            <span>${item.time}</span>
                            ${item.badge ? `<span class="notification-card-badge">${createIcon("alert")}${item.badge}</span>` : ""}
                        </div>
                    </article>
                `
            )
            .join("");

        return `
            <div class="notification-panel" data-notification-panel hidden>
                <div class="notification-panel-head">
                    <div class="notification-panel-title">
                        <span class="notification-panel-icon">${createIcon("bell")}</span>
                        <strong>Notifications</strong>
                        <span class="notification-panel-count" data-notification-new-badge>4 new</span>
                    </div>
                    <div class="notification-panel-actions">
                        <button type="button" class="notification-mark-read" data-notification-mark-read>Mark all read</button>
                        <button type="button" class="notification-panel-close" data-notification-close aria-label="Close notifications">
                            ${createIcon("close")}
                        </button>
                    </div>
                </div>
                <div class="notification-panel-list">
                    ${cards}
                </div>
                <button type="button" class="notification-view-all">View All Notifications</button>
            </div>
        `;
    };

    const closePanels = () => {
        document.querySelectorAll("[data-notification-panel]").forEach((panel) => {
            panel.hidden = true;
        });
        document.querySelectorAll("[data-notification-button]").forEach((button) => {
            button.setAttribute("aria-expanded", "false");
            button.classList.remove("is-open");
        });
    };

    const getStoredReadState = () => {
        try {
            return localStorage.getItem(storageKey) === "true";
        } catch (error) {
            return false;
        }
    };

    const persistReadState = (read) => {
        try {
            localStorage.setItem(storageKey, String(read));
        } catch (error) {
            // Ignore storage failures and still update the UI.
        }
    };

    window.markNotificationsRead = (button) => {
        updateButtonState(button, true);
        persistReadState(true);
        const panel = button?.parentElement?.querySelector("[data-notification-panel]");
        updatePanelState(panel, true);
    };

    document.addEventListener("DOMContentLoaded", () => {
        const buttons = document.querySelectorAll("[data-notification-button]");
        if (!buttons.length) {
            return;
        }

        const isRead = getStoredReadState();
        buttons.forEach((button) => {
            updateButtonState(button, isRead);
            button.insertAdjacentHTML("afterend", buildPanelMarkup());
            const panel = button.parentElement.querySelector("[data-notification-panel]");
            const markReadButton = panel?.querySelector("[data-notification-mark-read]");
            const closeButton = panel?.querySelector("[data-notification-close]");

            updatePanelState(panel, isRead);
            button.setAttribute("aria-expanded", "false");

            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();

                const shouldOpen = panel.hidden;
                closePanels();
                panel.hidden = !shouldOpen;
                button.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
                button.classList.toggle("is-open", shouldOpen);
            });

            markReadButton?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                window.markNotificationsRead(button);
            });

            closeButton?.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                panel.hidden = true;
                button.setAttribute("aria-expanded", "false");
                button.classList.remove("is-open");
            });

            panel?.querySelectorAll(".notification-card-close").forEach((dismissButton) => {
                dismissButton.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const card = dismissButton.closest("[data-notification-card]");
                    if (card) {
                        card.style.display = "none";
                    }
                });
            });
        });

        document.addEventListener("click", (event) => {
            if (!event.target.closest(".topbar-actions")) {
                closePanels();
            }
        });
    });
})();
