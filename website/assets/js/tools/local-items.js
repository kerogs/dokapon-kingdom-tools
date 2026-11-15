/**
 * Items dashboard: a Tabulator table plus three ECharts charts.
 *
 * URL parameter:
 *   ?area=<name>  Only show items acquired in the towns listed for that area
 *                 in assets/data/areas.json (e.g. ?area=Asiana, ?area=Hallstatt).
 *
 * Expected globals: Tabulator, echarts, and an optional page-level layout using
 * #items, #chart-top, #chart-towns, #chart-scatter.
 */

/* ========== Constants ========== */

/** Possible "best actions" for an item, keyed by their internal id. */
const ACTIONS = { king: 'Give to King', eat: 'Consume', sell: 'Sell' };

/** One color per action, shared by the table and the charts. */
const ACTION_COLORS = { king: '#d4a72c', eat: '#3fa7d6', sell: '#8a8a8a' };
const NEGATIVE_COLOR = '#e5484d';

/** Items at or below this price percentile (among consumables) are eaten rather than sold. */
const CHEAP_PERCENTILE = 0.5;

/** Castle gems and the Black Diamond: they cannot be consumed and are not town products. */
const UNUSABLE = new Set([
    'Jade', 'Ruby', 'Sapphire', 'Emerald', 'Tourmaline', 'Diamond', 'Opal', 'Black Diamond',
]);

/** Optional region filter read from the URL. */
const AREA = new URLSearchParams(location.search).get('area');

/* ========== Helpers ========== */

/** Formats a number with thousands separators (1234567 -> "1,234,567"). */
const fmt = n => n.toLocaleString('en-US');

/** @returns {boolean} True if the item can be eaten (i.e. is not a gem). */
const isConsumable = item => !UNUSABLE.has(item.name);

/**
 * Fetches a JSON file and fails loudly if the request does not succeed.
 * @param {string} url
 */
async function getJSON(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${url}`);
    return response.json();
}

/**
 * Sets the `action-<action>` CSS class on an element, replacing any previous one.
 * @param {HTMLElement} el
 * @param {keyof typeof ACTIONS} action
 */
function setActionClass(el, action) {
    el.classList.remove(...Object.keys(ACTIONS).map(key => `action-${key}`));
    el.classList.add(`action-${action}`);
}

/**
 * Builds the icon file name of an item: "black diamond" -> "Black_Diamond".
 * @param {string} name
 */
const iconFile = name =>
    encodeURI(name.replace(/ /g, '_')).replace(/(^|_)([a-z])/g, (_, sep, char) => sep + char.toUpperCase());

/* ========== Data ========== */

/**
 * Loads the items, restricted to the selected area when `?area=` is present.
 * Unknown areas yield an empty list.
 * @param {string} url Items JSON URL.
 * @returns {Promise<object[]>}
 */
async function loadItems(url) {
    const items = await getJSON(url);
    if (!AREA) return items;

    const towns = (await getJSON('./assets/data/areas.json'))[AREA];
    return Array.isArray(towns) ? items.filter(item => towns.includes(item.acquisition)) : [];
}

/**
 * Adds the best `action` to every item.
 *   1. king: the item raises the final score (positive local value)
 *   2. eat:  consumable and cheap, so selling would earn almost nothing
 *   3. sell: everything else (gold for equipment, or not consumable)
 *
 * The "cheap" threshold is computed on consumable items only.
 * @param {object[]} items
 * @returns {object[]} New items with an `action` field.
 */
function computeActions(items) {
    const prices = items.filter(isConsumable).map(i => i.price).sort((a, b) => a - b);
    const cheapLimit = prices[Math.floor(prices.length * CHEAP_PERCENTILE)];

    return items.map(item => ({
        ...item,
        action: item.localValue > 0 ? 'king'
              : isConsumable(item) && item.price <= cheapLimit ? 'eat'
              : 'sell',
    }));
}

/* ========== Table ========== */

/** Clicking a cell filters the table on that cell's value. */
const filterOnClick = field => (e, cell) => table.setFilter(field, '=', cell.getValue());

/** Column definition with a text header filter; `extra` extends or overrides the defaults. */
const column = (title, field, extra = {}) => ({ title, field, headerFilter: 'input', ...extra });

const table = new Tabulator('#items', {
    ajaxURL: './assets/data/items.json',
    ajaxRequestFunc: loadItems,
    ajaxResponse: (url, params, items) => computeActions(items),
    layout: 'fitColumns',
    pagination: true,
    paginationSize: 15,
    placeholder: 'No items found',
    columnDefaults: { resizable: false },
    initialSort: [{ column: 'name', dir: 'asc' }],
    rowFormatter: row => setActionClass(row.getElement(), row.getData().action),

    columns: [
        column('Name', 'name', {
            headerFilterPlaceholder: 'Search...',
            widthGrow: 2,
            // Icon + name; the icon is hidden if its image does not exist
            formatter: cell => {
                const name = cell.getValue();
                return `<img class="item-icon" src="./assets/images/game/items/${iconFile(name)}.webp"
                             loading="lazy" alt="" onerror="this.style.visibility='hidden'"> ${name}`;
            },
        }),

        column('Price', 'price', { sorter: 'number' }),

        column('Local Value', 'localValue', {
            sorter: 'number',
            // Green when positive, red otherwise
            formatter: cell => {
                const value = cell.getValue();
                cell.getElement().classList.toggle('is-pos', value > 0);
                cell.getElement().classList.toggle('is-neg', value <= 0);
                return value;
            },
        }),

        column('Acquisition', 'acquisition', { cellClick: filterOnClick('acquisition') }),

        {
            title: 'Best action',
            field: 'action',
            headerFilter: 'list',
            headerFilterPlaceholder: 'All',
            headerFilterParams: { values: ACTIONS, autocomplete: false, clearable: true },
            cellClick: filterOnClick('action'),
            formatter: cell => {
                setActionClass(cell.getElement(), cell.getValue());
                return ACTIONS[cell.getValue()];
            },
        },
    ],
});

/* ========== Charts: shared helpers ========== */

const SPLIT_LINE = { lineStyle: { opacity: 0.15 } };

/** Creates an ECharts instance that follows its container's size. */
function initChart(id) {
    const el = document.getElementById(id);
    const chart = echarts.init(el);
    new ResizeObserver(() => chart.resize()).observe(el);
    return chart;
}

const topChart = initChart('chart-top');
const townsChart = initChart('chart-towns');
const scatterChart = initChart('chart-scatter');

/** Reads color and font from the page at render time, so the charts follow the site theme. */
function getTheme() {
    const { color, fontFamily } = getComputedStyle(document.body);
    return {
        color,
        base: { textStyle: { fontFamily, color }, animationDuration: 500 },
        title: (text, subtext) => ({
            text, subtext, left: 'center',
            textStyle: { color, fontSize: 18 },
            subtextStyle: { color, fontSize: 12 },
        }),
    };
}

/** Dashed reference line at 0 on the given axis ('xAxis' | 'yAxis'). */
const zeroLine = (color, axis) => ({
    silent: true,
    symbol: 'none',
    label: { show: false },
    lineStyle: { type: 'dashed', color, opacity: 0.5 },
    data: [{ [axis]: 0 }],
});

/** Number of rows shown in the ranking charts. */
const TOP_N = 10;

/**
 * Horizontal ranking bar chart shared by the "top items" and "top towns" charts,
 * so both have exactly the same look. Positive bars are gold, negative bars red,
 * and a dashed line marks 0.
 *
 * @param {echarts.ECharts} chart
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}  [opts.subtext]
 * @param {{name: string, value: number}[]} opts.rows   Best row first; extra fields are passed to `tooltip`.
 * @param {(row: object) => string} [opts.tooltip]      Custom HTML tooltip for a row.
 */
function renderRanking(chart, { title, subtext, rows, tooltip }) {
    const theme = getTheme();
    const ordered = [...rows].reverse(); // the category axis is drawn bottom-up

    chart.setOption({
        ...theme.base,
        title: theme.title(title, subtext),
        grid: { left: 15, right: 65, top: 75, bottom: 20, containLabel: true },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            valueFormatter: fmt,
            ...(tooltip && { formatter: params => tooltip(ordered[params[0].dataIndex]) }),
        },
        xAxis: { type: 'value', axisLabel: { color: theme.color, formatter: fmt }, splitLine: SPLIT_LINE },
        yAxis: {
            type: 'category',
            data: ordered.map(r => r.name),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: theme.color, fontSize: 13 },
        },
        series: [{
            type: 'bar',
            barWidth: '60%',
            barMaxWidth: 28,
            data: ordered.map(({ value }) => ({
                value,
                itemStyle: {
                    color: value >= 0 ? ACTION_COLORS.king : NEGATIVE_COLOR,
                    borderRadius: value >= 0 ? [0, 6, 6, 0] : [6, 0, 0, 6],
                },
            })),
            label: { show: true, position: 'right', color: theme.color, fontSize: 13, formatter: p => fmt(p.value) },
            markLine: zeroLine(theme.color, 'xAxis'),
        }],
    });
}

/** Top items to give to the King (gems excluded: their value depends on castle investment). */
function renderTopChart(items) {
    const candidates = items
        .filter(i => i.action === 'king' && isConsumable(i))
        .sort((a, b) => b.localValue - a.localValue);

    renderRanking(topChart, {
        title: `Top ${Math.min(TOP_N, candidates.length)} items to give to the King`,
        subtext: `${candidates.length} items worth giving · ${items.length} items`,
        rows: candidates.slice(0, TOP_N).map(i => ({ name: i.name, value: i.localValue })),
    });
}

/** Top towns by average local value; the tooltip lists the items of each town. */
function renderTownsChart(items) {
    const towns = [...Map.groupBy(items.filter(isConsumable), i => i.acquisition)]
        .map(([name, list]) => ({
            name,
            items: list.toSorted((a, b) => b.localValue - a.localValue),
            value: Math.round(list.reduce((sum, i) => sum + i.localValue, 0) / list.length),
        }))
        .sort((a, b) => b.value - a.value);

    renderRanking(townsChart, {
        title: `Top ${Math.min(TOP_N, towns.length)} towns by average local value`,
        subtext: `${towns.length} towns · ${items.length} items`,
        rows: towns.slice(0, TOP_N),
        tooltip: town => `
            <b>${town.name}</b><br>
            Average local value: <b>${fmt(town.value)}</b><br>
            Items: ${town.items.length}<hr>
            ${town.items.map(i => `${i.name}: ${fmt(i.localValue)}`).join('<br>')}`,
    });
}

/** Top 10 towns by average local value; the tooltip lists the items of each town. */
function renderTownsChart(items) {
    const towns = [...Map.groupBy(items.filter(isConsumable), i => i.acquisition)]
        .map(([name, list]) => ({
            name,
            items: list.toSorted((a, b) => b.localValue - a.localValue),
            value: Math.round(list.reduce((sum, i) => sum + i.localValue, 0) / list.length),
        }))
        .sort((a, b) => b.value - a.value);

    renderRanking(townsChart, {
        title: `Top ${Math.min(10, towns.length)} towns by average local value`,
        subtext: `${towns.length} towns · ${items.length} items`,
        rows: towns.slice(0, 10),
        showAxis: true,
        fontSize: 12,
        right: 65,
        tooltip: town => `
            <b>${town.name}</b><br>
            Average local value: <b>${fmt(town.value)}</b><br>
            Items: ${town.items.length}<hr>
            ${town.items.map(i => `${i.name}: ${fmt(i.localValue)}`).join('<br>')}`,
    });
}

/** Price (log scale) vs local value, one series per action. */
function renderScatterChart(items) {
    const theme = getTheme();
    const axis = { axisLabel: { color: theme.color, formatter: fmt }, splitLine: SPLIT_LINE };

    scatterChart.setOption({
        ...theme.base,
        title: theme.title('Price vs local value'),
        legend: { bottom: 0, textStyle: { color: theme.color, fontSize: 14 } },
        grid: { left: 20, right: 30, top: 60, bottom: 70, containLabel: true },
        tooltip: {
            trigger: 'item',
            formatter: p => `<b>${p.data.name}</b><br>Price: ${fmt(p.value[0])}<br>Local value: ${fmt(p.value[1])}`,
        },
        xAxis: { type: 'log', name: 'Price', nameLocation: 'middle', nameGap: 30, axisLine: { onZero: false }, ...axis },
        yAxis: { type: 'value', name: 'Local value', ...axis },
        series: [
            ...Object.entries(ACTIONS).map(([key, label]) => ({
                name: label,
                type: 'scatter',
                symbolSize: 13,
                itemStyle: { color: ACTION_COLORS[key], opacity: 0.9 },
                data: items
                    .filter(i => i.action === key)
                    .map(i => ({ name: i.name, value: [i.price, i.localValue] })),
            })),
            // Dashed line at 0: above it the King gives gold, below it he takes some
            { type: 'scatter', data: [], silent: true, markLine: zeroLine(theme.color, 'yAxis') },
        ],
    });
}

/** Redraws every chart from the given items. */
function renderAll(items) {
    renderTopChart(items);
    renderTownsChart(items);
    renderScatterChart(items);
}

/* ========== Wiring ========== */

// Charts are drawn once fonts are ready (so text sizes are correct), then on every filter change
table.on('dataLoaded', items => document.fonts.ready.then(() => renderAll(items)));
table.on('dataFiltered', (filters, rows) => renderAll(rows.map(row => row.getData())));
