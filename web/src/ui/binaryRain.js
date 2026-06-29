const canvases = document.querySelectorAll("[data-binary-rain]");

canvases.forEach((canvas) => {
  const context = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!context || prefersReducedMotion) {
    return;
  }

  let width = 0;
  let height = 0;
  let columns = [];
  const fontSize = 15;
  const glyphs = ["0", "1"];

  function resize() {
    const scale = window.devicePixelRatio || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * scale);
    canvas.height = Math.floor(height * scale);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    columns = Array.from({ length: Math.ceil(width / fontSize) }, () => Math.random() * height);
  }

  function draw() {
    context.fillStyle = "rgba(10, 14, 15, 0.14)";
    context.fillRect(0, 0, width, height);
    context.font = `${fontSize}px "JetBrains Mono", ui-monospace, monospace`;

    columns.forEach((y, index) => {
      const x = index * fontSize;
      const glyph = glyphs[(Math.random() * glyphs.length) | 0];
      const roll = Math.random();
      // teal ramp: bright leading glyphs fade back into the brand/deep-teal body
      context.fillStyle = roll > 0.93 ? "#3bd6b0" : roll > 0.78 ? "#1cabb8" : "#22b8a0";
      context.fillText(glyph, x, y);
      columns[index] = y > height + Math.random() * 900 ? 0 : y + fontSize;
    });

    window.requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  draw();
});
