// Load the verion of the website
fetch("./version.json")
	.then(response => {
		if (!response.ok) {
			throw new Error(`HTTP error: ${response.status}`)
		}

		return response.json();
	})
	.then(data => {
		document.querySelector("#webversion").textContent = data.version
	})
	.catch(error => {
		console.error("Impossible de récupérer la version :", error);
	})

const root = document.documentElement;
const getCookie = n => document.cookie.split('; ').find(c => c.startsWith(n + '='))?.split('=')[1];
const setCookie = (n, v) => document.cookie = `${n}=${v}; max-age=31536000; path=/; SameSite=Lax`;

// settings
const PRIMARY = [
    { id: 'default', name: 'Default', bg: '#c28a10', fg: '#241d10' },
    { id: 'blue',    name: 'Blue',    bg: '#2f78d6', fg: '#ffffff' },
    { id: 'red',     name: 'Red',     bg: '#d8343d', fg: '#ffffff' },
    { id: 'green',   name: 'Green',   bg: '#198a50', fg: '#ffffff' },
    { id: 'purple',  name: 'Purple',  bg: '#8a52d6', fg: '#ffffff' },
    { id: 'mono',    name: 'Mono',    bg: '#0b0c18', fg: '#ffffff' },
];
const BACKGROUND = [
    { id: 'light', name: 'Light', bg: '#fbfbfe', fg: '#14162a' },
    { id: 'dark',  name: 'Dark',  bg: '#141626', fg: '#f2f1fa' },
];

const BG_DIR = '../../assets/images/backgrounds/';
const WALLPAPER = [
    '0.png', 'Casino_Background.png', 'Casino_Cave_Background.png', 'Lava_Cave_Background.png',
    'Pyramid_Background.png', 'Snowfield_Background.png', 'Sunken_Shrine_Background.png',
    'Swamp_Background.png', 'Underworld_Background.png', 'Weapon_Store_Background.png',
    'plain_background.png',
].map(f => ({
    id: f,
    name: f === '0.png' ? 'Default' : f.replace(/_?background\.png$/i, '').replace(/_/g, ' '),
    bg: `url('${BG_DIR}${f}') center/cover`,
    sub: '',
    fg: '#ffffff',
}));

const cBg = getCookie('bg');
const state = {
    prim: getCookie('prim') || 'default',
    theme: getCookie('theme') || 'light',
    bg: WALLPAPER.some(w => w.id === cBg) ? cBg : '0.png',
};

function applyTheme() {
    root.className = root.className.replace(/(^|\s)(prim|theme)--\S+/g, '').trim();
    if (state.prim !== 'default') root.classList.add('prim--' + state.prim);
    if (state.theme === 'dark') root.classList.add('theme--dark');
    root.style.setProperty('--bg-image', `url("${BG_DIR}${state.bg}")`);
}
applyTheme();
