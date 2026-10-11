const active_canvas = document.getElementById('ttt_canvas');
const active_ctx = active_canvas.getContext('2d');

// Offscreen buffer to do initial draw of grid
const offscreen_grid_canvas = document.createElement('canvas');
const offscreen_grid_ctx = offscreen_grid_canvas.getContext('2d');

const grid_canvas = document.getElementById('grid_canvas');
const gl = grid_canvas.getContext('webgl2', { antialias: true });

function resizeCanvas() {
    // Set drawing buffer dimensions to match the window
    active_canvas.width = document.documentElement.clientWidth;
    active_canvas.height = window.innerHeight;
    grid_canvas.width = document.documentElement.clientWidth;
    grid_canvas.height = window.innerHeight;
    offscreen_grid_canvas.width = document.documentElement.clientWidth;
    offscreen_grid_canvas.height = window.innerHeight;
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
    offscreen_grid_ctx.shadowColor = 'transparent';
    offscreen_grid_ctx.shadowBlur = 0;
    offscreen_grid_ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
    offscreen_grid_ctx.fillRect(0, 0, active_canvas.width, active_canvas.height);

    for (let log_t_main = log_t_min; log_t_main <= log_t_max; log_t_main += 1) {
        offscreen_grid_ctx.strokeStyle = `rgba(128, 128, 128, 1.0)`;
        offscreen_grid_ctx.shadowColor = `rgba(128, 128, 128, 1.0)`;
        offscreen_grid_ctx.lineWidth = 2.0;
        offscreen_grid_ctx.shadowBlur = 6;

        let x = (log_t_main - log_t_min) / (log_t_max - log_t_min) * active_canvas.width;
        offscreen_grid_ctx.beginPath();
        offscreen_grid_ctx.moveTo(x, 0);
        offscreen_grid_ctx.lineTo(x, active_canvas.height);
        offscreen_grid_ctx.stroke();

        for (let log_t_sub = 1; log_t_sub <= 9; log_t_sub += 1) {
            offscreen_grid_ctx.strokeStyle = `rgba(128, 128, 128, ${log_t_sub / 10 + .1})`;
            offscreen_grid_ctx.shadowColor = `rgba(128, 128, 128, ${log_t_sub / 10 + .1})`;
            offscreen_grid_ctx.lineWidth = 1.0;
            offscreen_grid_ctx.shadowBlur = 6;

            let x = (log_t_main + Math.log10(log_t_sub) - log_t_min) / (log_t_max - log_t_min) * active_canvas.width;
            offscreen_grid_ctx.beginPath();
            offscreen_grid_ctx.moveTo(x, 0);
            offscreen_grid_ctx.lineTo(x, active_canvas.height);
            offscreen_grid_ctx.stroke();
        }
    }

    for (let T_frac = 0; T_frac <= 1; T_frac += 0.2) {
        offscreen_grid_ctx.beginPath();
        offscreen_grid_ctx.moveTo(0, active_canvas.height * T_frac);
        offscreen_grid_ctx.lineTo(active_canvas.width, active_canvas.height * T_frac);
        offscreen_grid_ctx.stroke();
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


// --- GLSL ES 3.0 SHADERS ---
const vsSource = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  // Map clip-space [-1, 1] to UV coords [0, 1]
  v_uv = vec2(a_position.x * 0.5 + 0.5, 1.0 - (a_position.y * 0.5 + 0.5));
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const fsSource = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_radius;
uniform float u_displacement;
uniform float u_peak_mag;

// GLSL 2D Simplex Noise
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                     -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m*m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 pixelPos = v_uv * u_resolution;
  float dist = distance(pixelPos, u_mouse);

  // Gaussian Falloff Curve with 0.5 baseline
  float factor = 1.0 + u_peak_mag * exp(-0.5 * (dist * dist) / u_radius / u_radius);

  // --- EDGE DAMPENING (Prevents sampling past borders) ---
  // Calculates distance to the nearest canvas edge in UV space [0.0 to 1.0]
  vec2 edgeDist = min(v_uv, 1.0 - v_uv);
  
  // Creates a smooth 0.0 -> 1.0 ramp within 5% (0.05) of any border
  float edgeFactor = smoothstep(0.0, 0.05, min(edgeDist.x, edgeDist.y));
  
  // Multiply factor by edgeFactor to fade displacement near borders
  factor *= edgeFactor;

  vec2 st = v_uv * 10.0;
  float noiseX = snoise(st + vec2(u_time * 0.5, 0.0));
  float noiseY = snoise(st + vec2(100.0, u_time * 0.5));

  vec2 offset = vec2(noiseX, noiseY) * (factor * u_displacement / u_resolution);
  vec2 sampleUV = clamp(v_uv + offset, 0.0, 1.0);

  // WebGL 2 texture lookup
  fragColor = texture(u_texture, sampleUV);
}`;

// --- SETUP SHADER PROGRAM & QUAD BUFFER ---
function createShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
}

// Keep references globally scoped so they can be re-initialized
let program, positionBuffer, vao, uniforms, texture;

function initWebGL() {
    // --- SETUP SHADER PROGRAM & QUAD BUFFER ---
    program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    gl.useProgram(program);

    // Full screen quad geometry
    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1,
        -1, 1, 1, -1, 1, 1
    ]), gl.STATIC_DRAW);

    // VAO (Vertex Array Object)
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Get Uniform Locations
    uniforms = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        mouse: gl.getUniformLocation(program, 'u_mouse'),
        time: gl.getUniformLocation(program, 'u_time'),
        radius: gl.getUniformLocation(program, 'u_radius'),
        displacement: gl.getUniformLocation(program, 'u_displacement'),
        peak_mag: gl.getUniformLocation(program, 'u_peak_mag'),
    };

    // Texture Initialization
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

// --- CONTEXT LOSS & RESTORE HANDLING ---
grid_canvas.addEventListener('webglcontextlost', (e) => {
    // Prevent default so the browser knows you intend to recover the context
    e.preventDefault();
}, false);

grid_canvas.addEventListener('webglcontextrestored', () => {
    // Rebuild all GPU resources from scratch
    initWebGL();
}, false);

// Run initial WebGL setup
initWebGL();

// Render Call inside Loop
function render_distortion(sourceCanvas, pos_x, pos_y, magnitude, time) {
    // Update Texture from offscreen canvas/image
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);

    gl.uniform2f(uniforms.resolution, sourceCanvas.width, sourceCanvas.height);
    gl.uniform2f(uniforms.mouse, pos_x, pos_y); // Bottom-left GL origin
    gl.uniform1f(uniforms.time, time);
    gl.uniform1f(uniforms.radius, sourceCanvas.width / 10);
    gl.uniform1f(uniforms.displacement, 3.0);
    gl.uniform1f(uniforms.peak_mag, magnitude);

    gl.viewport(0, 0, sourceCanvas.width, sourceCanvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
    let brightness = softClamp(brightness_raw, 0.75, 1.0, 2);
    render_distortion(offscreen_grid_canvas, px, py, softClamp(v_mag / Math.sqrt(active_canvas.width), 0, 9.0), now);
    draw_ttt(px, py, brightness);
    requestAnimationFrame(render_frame);
}

// Draw initial grid
draw_grid();

// Start animation loop
requestAnimationFrame(render_frame);