const MANIFEST_URL = 'data/pre-pog.json';

const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);

export function createOriginArchive() {
    const shell = document.createElement('section');
    shell.className = 'founder-origin-archive';
    shell.tabIndex = -1;
    shell.setAttribute('aria-label', 'GALANACCI visual archive');

    const field = document.createElement('div');
    field.className = 'origin-memory-field';
    field.setAttribute('aria-busy', 'true');
    const backdrop = document.createElement('div');
    backdrop.className = 'origin-focus-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    shell.append(field, backdrop);

    let disposed = false;
    let frame = 0;
    let previousTime = performance.now();
    let focused = null;
    let motionPausedUntil = 0;
    const memories = [];

    const bounds = () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        edge: 8,
        bottomEdge: 8
    });

    const sizeFor = (item) => {
        const compact = matchMedia('(max-width: 700px)').matches;
        const ratio = item.width / item.height;
        let width = compact ? randomBetween(54, 112) : randomBetween(82, 190);
        const maximumHeight = compact ? 154 : 250;
        if (width / ratio > maximumHeight) width = maximumHeight * ratio;
        return Math.max(compact ? 48 : 70, width);
    };

    const dimensions = (memory, width = memory.width) => ({
        width,
        height: width * memory.item.height / memory.item.width
    });

    const place = (memory) => {
        const area = bounds();
        const size = dimensions(memory);
        memory.x = randomBetween(area.edge, Math.max(area.edge, area.width - size.width - area.edge));
        memory.y = randomBetween(area.edge, Math.max(area.edge, area.height - size.height - area.bottomEdge));
        const angle = randomBetween(0, Math.PI * 2);
        const speed = randomBetween(12, 28);
        memory.vx = Math.cos(angle) * speed;
        memory.vy = Math.sin(angle) * speed;
        if (Math.abs(memory.vx) < 4) memory.vx = Math.sign(memory.vx || 1) * 4;
        if (Math.abs(memory.vy) < 4) memory.vy = Math.sign(memory.vy || 1) * 4;
    };

    const paint = (memory) => {
        memory.node.style.width = `${memory.width}px`;
        memory.node.style.transform = `translate3d(${memory.x}px, ${memory.y}px, 0)`;
    };

    const focusDimensions = (memory) => {
        const area = bounds();
        const ratio = memory.item.width / memory.item.height;
        const maxWidth = area.width * (area.width <= 700 ? 0.9 : 0.84);
        const maxHeight = (area.height - 84) * 0.88;
        const width = Math.min(maxWidth, maxHeight * ratio);
        return { width, height: width / ratio };
    };

    const positionFocused = (memory) => {
        const area = bounds();
        const size = focusDimensions(memory);
        memory.width = size.width;
        memory.x = (area.width - size.width) / 2;
        memory.y = (area.height - size.height) / 2;
        paint(memory);
    };

    const closeFocus = ({ restoreFocus = true } = {}) => {
        if (!focused) return false;
        const memory = focused;
        focused = null;
        shell.classList.remove('is-focused');
        memory.node.classList.remove('is-focused');
        memory.node.setAttribute('aria-pressed', 'false');
        memory.node.setAttribute('aria-label', `View ${memory.item.alt}`);
        memory.image.src = memory.item.thumb;
        memory.width = memory.home.width;
        memory.x = memory.home.x;
        memory.y = memory.home.y;
        paint(memory);
        motionPausedUntil = performance.now() + 520;
        if (restoreFocus) memory.node.focus({ preventScroll: true });
        return true;
    };

    const openFocus = (memory) => {
        if (focused === memory) {
            closeFocus();
            return;
        }
        if (focused) closeFocus({ restoreFocus: false });
        memory.home = { x: memory.x, y: memory.y, width: memory.width };
        focused = memory;
        shell.classList.add('is-focused');
        memory.node.classList.add('is-focused');
        memory.node.setAttribute('aria-pressed', 'true');
        memory.node.setAttribute('aria-label', `Close ${memory.item.alt}`);
        if (memory.fullLoaded) {
            memory.image.src = memory.item.src;
        } else if (!memory.fullImage) {
            const fullImage = new Image();
            memory.fullImage = fullImage;
            fullImage.decoding = 'async';
            fullImage.addEventListener('load', () => {
                memory.fullLoaded = true;
                if (focused === memory && !disposed) memory.image.src = memory.item.src;
            }, { once: true });
            fullImage.src = memory.item.src;
        }
        positionFocused(memory);
    };

    const update = (time) => {
        if (disposed) return;
        const minimumFrameTime = window.innerWidth <= 700 ? 32 : 16;
        if (time - previousTime < minimumFrameTime) {
            frame = requestAnimationFrame(update);
            return;
        }
        const delta = Math.min(0.04, Math.max(0, (time - previousTime) / 1000));
        previousTime = time;
        if (!focused && time >= motionPausedUntil && !document.hidden) {
            const area = bounds();
            memories.forEach((memory) => {
                const size = dimensions(memory);
                memory.x += memory.vx * delta;
                memory.y += memory.vy * delta;
                if (memory.x <= area.edge || memory.x + size.width >= area.width - area.edge) {
                    memory.vx *= -1;
                    memory.x = Math.min(Math.max(memory.x, area.edge), Math.max(area.edge, area.width - size.width - area.edge));
                }
                if (memory.y <= area.edge || memory.y + size.height >= area.height - area.bottomEdge) {
                    memory.vy *= -1;
                    memory.y = Math.min(Math.max(memory.y, area.edge), Math.max(area.edge, area.height - size.height - area.bottomEdge));
                }
                paint(memory);
            });
        }
        frame = requestAnimationFrame(update);
    };

    const resize = () => {
        if (focused) {
            positionFocused(focused);
            return;
        }
        const area = bounds();
        memories.forEach((memory) => {
            const size = dimensions(memory);
            memory.x = Math.min(Math.max(memory.x, area.edge), Math.max(area.edge, area.width - size.width - area.edge));
            memory.y = Math.min(Math.max(memory.y, area.edge), Math.max(area.edge, area.height - size.height - area.bottomEdge));
            paint(memory);
        });
    };

    const keydown = (event) => {
        if (event.key !== 'Escape' || !focused) return;
        event.preventDefault();
        event.stopPropagation();
        closeFocus();
    };

    window.addEventListener('resize', resize);
    shell.addEventListener('keydown', keydown);

    fetch(MANIFEST_URL, { cache: 'no-cache' })
        .then((response) => {
            if (!response.ok) throw new Error(`Origin archive request failed: ${response.status}`);
            return response.json();
        })
        .then((items) => {
            if (disposed || !Array.isArray(items) || !items.length) return;
            const nodes = items.map((item, index) => {
                const node = document.createElement('button');
                node.type = 'button';
                node.className = 'origin-memory';
                node.dataset.originId = item.id;
                node.setAttribute('aria-label', `View ${item.alt}`);
                node.setAttribute('aria-pressed', 'false');
                node.style.zIndex = String(1 + (index % 12));
                const image = document.createElement('img');
                image.src = item.thumb;
                image.alt = item.alt;
                image.width = item.width;
                image.height = item.height;
                image.decoding = 'async';
                image.draggable = false;
                node.append(image);
                const memory = {
                    item,
                    node,
                    image,
                    width: sizeFor(item),
                    x: 0,
                    y: 0,
                    vx: 0,
                    vy: 0,
                    home: null,
                    fullLoaded: false,
                    fullImage: null
                };
                place(memory);
                paint(memory);
                node.addEventListener('click', () => openFocus(memory));
                memories.push(memory);
                return node;
            });
            field.replaceChildren(...nodes);
            field.setAttribute('aria-busy', 'false');
            const firstVisibleImages = memories.slice(0, 12).map(({ image }) => (
                typeof image.decode === 'function' ? image.decode().catch(() => undefined) : Promise.resolve()
            ));
            Promise.all(firstVisibleImages).finally(() => {
                if (disposed) return;
                shell.classList.add('is-ready');
                previousTime = performance.now();
                frame = requestAnimationFrame(update);
            });
        })
        .catch((error) => {
            console.error('Origin archive could not be loaded.', error);
            field.setAttribute('aria-busy', 'false');
        });

    shell.dispose = () => {
        disposed = true;
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', resize);
        shell.removeEventListener('keydown', keydown);
    };

    return shell;
}
