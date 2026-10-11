const active_canvas = document.getElementById('ttt_canvas');
const active_ctx = active_canvas.getContext('2d');

const grid_canvas = document.getElementById('grid_canvas');
const grid_ctx = grid_canvas.getContext('2d');

function resizeCanvas() {
    // Set drawing buffer dimensions to match the window
    active_canvas.width = document.documentElement.clientWidth;
    active_canvas.height = window.innerHeight;
    grid_canvas.width = document.documentElement.clientWidth;
    grid_canvas.height = window.innerHeight;
    draw_grid();
}

// Avrami parameters
const T_crit = 1300;
const n = 0.67;
const lnA = Math.log(1.14e8);
const Q = 201.9e3;
const R = 8.314;

// Plot ranges
const y_levels = Array.from({ length: 10 }, (_, index) => 0.05 + index * 0.1)
const T_max = T_crit - 1;
const T_min = 900;
const log_t_max = 7;
const log_t_min = 2;
const log_conv = 1 / Math.log(10);

// Plotting resolution
const num_traces = y_levels.length;
const steps_per_trace = 500;

function y_prime(T, log_t) {
    return n * log_t / log_conv + lnA - Q / R / T + 2 * Math.log((T_crit - T) / T_crit)
}

function T(t) {
    return T_max - (T_max - T_min) * t / steps_per_trace
}

function log_t(T, y_prime) {
    return log_conv * (1 / n) * (y_prime - lnA + Q / R / T - 2 * Math.log((T_crit - T) / T_crit))
}

function screenX(t, y_prime) {
    return active_canvas.width * (log_t(T(t), y_prime) - log_t_min) / (log_t_max - log_t_min)
}

function screenY(t) {
    return active_canvas.height * t / steps_per_trace
}

function draw_grid() {
    // Clear the screen to black
    grid_ctx.shadowColor = 'transparent';
    grid_ctx.shadowBlur = 0;
    grid_ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
    grid_ctx.fillRect(0, 0, active_canvas.width, active_canvas.height);

    for (let log_t_main = log_t_min; log_t_main <= log_t_max; log_t_main += 1) {
        grid_ctx.strokeStyle = `rgba(128, 128, 128, 1.0)`;
        grid_ctx.shadowColor = `rgba(128, 128, 128, 1.0)`;
        grid_ctx.lineWidth = 2.0;
        grid_ctx.shadowBlur = 6;

        let x = (log_t_main - log_t_min) / (log_t_max - log_t_min) * active_canvas.width;
        grid_ctx.beginPath();
        grid_ctx.moveTo(x, 0);
        grid_ctx.lineTo(x, active_canvas.height);
        grid_ctx.stroke();

        for (let log_t_sub = 1; log_t_sub <= 9; log_t_sub += 1) {
            grid_ctx.strokeStyle = `rgba(128, 128, 128, ${log_t_sub / 10 + .1})`;
            grid_ctx.shadowColor = `rgba(128, 128, 128, ${log_t_sub / 10 + .1})`;
            grid_ctx.lineWidth = 1.0;
            grid_ctx.shadowBlur = 6;

            let x = (log_t_main + Math.log10(log_t_sub) - log_t_min) / (log_t_max - log_t_min) * active_canvas.width;
            grid_ctx.beginPath();
            grid_ctx.moveTo(x, 0);
            grid_ctx.lineTo(x, active_canvas.height);
            grid_ctx.stroke();
        }
    }

    for (let T_frac = 0; T_frac <= 1; T_frac += 0.2) {
        grid_ctx.beginPath();
        grid_ctx.moveTo(0, active_canvas.height * T_frac);
        grid_ctx.lineTo(active_canvas.width, active_canvas.height * T_frac);
        grid_ctx.stroke();
    }
}

function draw_ttt(px, py, brightness) {
    // Clear shadow properties before drawing trail rects, use alpha to create decay effect
    active_ctx.shadowColor = 'transparent';
    active_ctx.shadowBlur = 0;
    active_ctx.globalCompositeOperation = 'destination-out';
    active_ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    active_ctx.fillRect(0, 0, active_canvas.width, active_canvas.height);
    active_ctx.globalCompositeOperation = 'source-over';

    // Trace styling
    active_ctx.lineWidth = 4;
    active_ctx.shadowBlur = 12;

    let T = py / active_canvas.height * (T_min - T_max) + T_max;
    let log_t = px / active_canvas.width * (log_t_max - log_t_min) + log_t_min;

    let y_prime_var = y_prime(T, log_t);
    console.log(y_prime_var);

    // Render traces, scanning over temperature to compute log(t) for given y level
    let rgb = 255 * brightness;
    active_ctx.strokeStyle = `rgba(${rgb}, ${rgb}, ${rgb}, 1.0)`;
    active_ctx.shadowColor = `rgba(255, 255, 255, ${brightness / 2})`;

    active_ctx.beginPath();
    active_ctx.moveTo(screenX(0), screenY(0));
    for (let t = 0.0; t <= steps_per_trace; t += 1) {
        active_ctx.lineTo(screenX(t, y_prime_var), screenY(t));
    }
    active_ctx.stroke();

}

// Adjust canvas dimensions whenever screen layout updates
window.addEventListener('resize', resizeCanvas);

// Run initially on page load
resizeCanvas();

// Mouse 2nd order "physics" state variables
let mouseX = active_canvas.width / 2;
let mouseY = active_canvas.height / 2;
let px = active_canvas.width / 2;
let py = active_canvas.height / 2;
let vx = 0.0;
let vy = 0.0;

// 2nd order dynamics constants
const omega_n = 3 * 2 * 3.14;
const zeta = 1.0;
const m = 1.0;
const k = omega_n ^ 2 * m;
const c = zeta * 2 * Math.sqrt(k * m);

// Timestamp
let lastTime = performance.now() / 1000.0;

active_canvas.addEventListener('mousemove', (e) => {
    const rect = active_canvas.getBoundingClientRect();

    // X, Y relative to the canvas canvas boundary
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
});

function softClamp(value, min, max, smoothness = 1) {
    const center = (min + max) / 2;
    const range = (max - min) / 2;

    // Normalized distance from center
    const normalized = (value - center) / (range * smoothness);

    return center + range * Math.tanh(normalized);
}

function render_frame(timestamp) {
    // Convert from milliseconds to seconds
    let now = timestamp / 1000.0;
    let dt = now - lastTime;

    // Calculate acceleration
    let ax = (k * (mouseX - px) - c * vx) / m;
    let ay = (k * (mouseY - py) - c * vy) / m;

    // Euler integration for now
    vx = vx + ax * dt;
    vy = vy + ay * dt;
    px = px + vx * dt;
    py = py + vy * dt;

    lastTime = now;

    let v_mag = Math.sqrt(vx * vx + vy * vy)
    let brightness_raw = v_mag / (active_canvas.width / 10);
    let brightness = softClamp(brightness_raw, 0.4, 1.0, 2)
    draw_ttt(px, py, brightness);
    requestAnimationFrame(render_frame);
}

// Draw initial grid
draw_grid();

// Start animation loop
requestAnimationFrame(render_frame);