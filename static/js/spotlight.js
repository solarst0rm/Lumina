(function () {
    'use strict';

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isEditableTarget(target) {
        return !!(target && (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable
        ));
    }

    function readStoredState() {
        try {
            return window.localStorage.getItem('blind-spotlight') === '1';
        } catch (error) {
            return false;
        }
    }

    function storeState(active) {
        try {
            window.localStorage.setItem('blind-spotlight', active ? '1' : '0');
        } catch (error) {
            // Ignore storage failures.
        }
    }

    function createController() {
        var overlay = document.getElementById('blind-spotlight-overlay');
        var toggleBtn = document.getElementById('blind-spotlight-toggle');
        if (!overlay || !toggleBtn) {
            return null;
        }

        var toggleIcon = toggleBtn.querySelector('i');
        var active = false;
        var cursorX = Math.round((window.innerWidth || 0) / 2);
        var cursorY = Math.round((window.innerHeight || 0) / 2);
        var framePending = false;

        function render() {
            if (!active) {
                return;
            }
            overlay.style.background =
                'radial-gradient(circle 120px at ' + cursorX + 'px ' + cursorY + 'px, ' +
                'rgba(0,0,0,0) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.72) 74%, rgba(0,0,0,0.98) 100%)';
        }

        function scheduleRender() {
            if (!active || framePending) {
                return;
            }
            framePending = true;
            window.requestAnimationFrame(function () {
                framePending = false;
                render();
            });
        }

        function updatePointer(x, y) {
            cursorX = clamp(Number(x) || 0, 0, window.innerWidth || 0);
            cursorY = clamp(Number(y) || 0, 0, window.innerHeight || 0);
            scheduleRender();
        }

        function setActive(nextActive) {
            active = !!nextActive;
            storeState(active);
            overlay.style.display = active ? 'block' : 'none';
            overlay.setAttribute('aria-hidden', active ? 'false' : 'true');
            toggleBtn.classList.toggle('active', active);
            toggleBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
            toggleBtn.title = active ? '关闭视障体验模式' : '视障体验模式';
            toggleBtn.setAttribute('aria-label', active ? '关闭视障体验模式' : '视障体验模式');
            if (toggleIcon) {
                toggleIcon.className = active ? 'fas fa-eye-slash' : 'fas fa-eye';
            }
            if (active) {
                render();
            }
        }

        function toggle() {
            setActive(!active);
        }

        toggleBtn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            toggle();
        });

        document.addEventListener('keydown', function (event) {
            if (event.altKey || event.ctrlKey || event.metaKey) {
                return;
            }
            if (window._tutorialActive || window._helpOverlayOpen || window._aiWindowOpen) {
                return;
            }
            if (isEditableTarget(event.target)) {
                return;
            }
            if (String(event.key || '').toLowerCase() !== 't') {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            toggle();
        }, true);

        document.addEventListener('mousemove', function (event) {
            if (!active) {
                return;
            }
            updatePointer(event.clientX, event.clientY);
        }, { passive: true });

        document.addEventListener('touchmove', function (event) {
            if (!active || !event.touches || !event.touches[0]) {
                return;
            }
            updatePointer(event.touches[0].clientX, event.touches[0].clientY);
        }, { passive: true });

        window.addEventListener('resize', function () {
            updatePointer(cursorX, cursorY);
        });

        setActive(readStoredState());

        return {
            toggle: toggle,
            setActive: setActive,
        };
    }

    function init() {
        if (window.__blindSpotlightStandaloneLoaded) {
            return;
        }
        var controller = createController();
        if (!controller) {
            return;
        }
        window.__blindSpotlightStandaloneLoaded = true;
        window.toggleBlindSpotlight = controller.toggle;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
