// Chart.js simplified implementation for demo purposes
// In production, you would import the full Chart.js library
class Chart {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    this.ctx = canvas.getContext('2d');
    this.data = config.data;
    this.render();

    // Set canvas dimensions to match parent
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    this.canvas.width = parent.clientWidth;
    this.canvas.height = parent.clientHeight;
    this.render();
  }

  update() {
    this.render();
  }

  render() {
    const { ctx, canvas, data, config } = this;
    const { datasets, labels } = data;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const gridCount = 5;
    for (let i = 0; i <= gridCount; i++) {
      const y = height - (i / gridCount) * (height - 40) - 20;
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(width - 20, y);
      ctx.stroke();
    }

    // Calculate max value for scaling
    let maxValue = 0;
    datasets.forEach((dataset) => {
      const dataMax = Math.max(...dataset.data);
      if (dataMax > maxValue) maxValue = dataMax;
    });
    if (maxValue === 0) maxValue = 100; // Default if no data

    // Draw each dataset
    datasets.forEach((dataset, datasetIndex) => {
      const { data, borderColor, backgroundColor, label } = dataset;

      // Line chart
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.beginPath();

      // Plot data points
      const pointCount = data.length;
      const pointSpacing = (width - 60) / (pointCount > 1 ? pointCount - 1 : 1);

      data.forEach((value, index) => {
        const x = 40 + index * pointSpacing;
        const normalizedValue = value / maxValue;
        const y = height - normalizedValue * (height - 40) - 20;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });

      ctx.stroke();

      // Fill area under the line
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.lineTo(40 + (pointCount - 1) * pointSpacing, height - 20);
        ctx.lineTo(40, height - 20);
        ctx.closePath();
        ctx.fill();
      }

      // Draw legend
      ctx.fillStyle = borderColor;
      ctx.fillRect(60 + datasetIndex * 100, 10, 12, 12);
      ctx.fillStyle = '#e0e0e0';
      ctx.font = '12px sans-serif';
      ctx.fillText(label, 76 + datasetIndex * 100, 20);
    });

    // Y-axis labels
    ctx.fillStyle = '#b0b0b0';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= gridCount; i++) {
      const value = ((maxValue * i) / gridCount).toFixed(0);
      const y = height - (i / gridCount) * (height - 40) - 16;
      ctx.fillText(value, 35, y);
    }

    // X-axis labels (last 5 for simplicity)
    if (labels && labels.length > 0) {
      ctx.textAlign = 'center';
      const visibleLabels = labels.slice(-5);
      const labelSpacing = (width - 60) / (visibleLabels.length > 1 ? visibleLabels.length - 1 : 1);

      visibleLabels.forEach((label, index) => {
        const x = 40 + index * labelSpacing;
        ctx.fillText(label, x, height - 5);
      });
    }
  }
}
