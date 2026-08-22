function setupGlobalTableSort() {
  document.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;

    const table = th.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!table || !tbody) return;

    const thIndex = Array.from(th.parentNode.children).indexOf(th);
    const currentIsAsc = th.classList.contains('sort-asc');
    const newDirection = !currentIsAsc;

    // Reset indicator classes across all headers in this table
    th.parentNode.querySelectorAll('th').forEach(header => {
      header.classList.remove('sort-asc', 'sort-desc');
      const arrow = header.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = ' ↕';
    });

    // Mark active column
    th.classList.add(newDirection ? 'sort-asc' : 'sort-desc');
    let arrow = th.querySelector('.sort-arrow');
    if (!arrow) {
      arrow = document.createElement('span');
      arrow.className = 'sort-arrow ml-1 font-mono text-[10px] text-slate-400';
      th.appendChild(arrow);
    }
    arrow.textContent = newDirection ? ' ▲' : ' ▼';

    // Sort rows
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((rowA, rowB) => {
      const cellA = rowA.children[thIndex]?.innerText.trim() || '';
      const cellB = rowB.children[thIndex]?.innerText.trim() || '';

      // 1. Numeric / Points / Percentage Cleaner
      const parseVal = (str) => {
        // Strip prefixes/suffixes: pts, %, $, +, #
        const clean = str.replace(/pts|%|\$|\+|#|,/gi, '').trim();

        // Handle W-L or W-L-T records (e.g. 10-4 or 12-3-1)
        if (clean.includes('-')) {
          const parts = clean.split('-').map(Number);
          if (!parts.some(isNaN)) {
            const total = parts.reduce((a, b) => a + b, 0);
            return total > 0 ? (parts[0] + (parts[2] || 0) * 0.5) / total : 0;
          }
        }

        const num = parseFloat(clean);
        return isNaN(num) ? str.toLowerCase() : num;
      };

      const valA = parseVal(cellA);
      const valB = parseVal(cellB);

      if (typeof valA === 'number' && typeof valB === 'number') {
        return newDirection ? valA - valB : valB - valA;
      }
      return newDirection 
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    // Re-append sorted rows to tbody
    rows.forEach(r => tbody.appendChild(r));
  });
}