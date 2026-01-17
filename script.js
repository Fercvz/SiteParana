// Debugging Global Errors
window.onerror = function (msg, url, line, col, error) {
    alert("Error: " + msg + "\nLine: " + line);
    return false;
};

document.addEventListener('DOMContentLoaded', async () => {
    // alert("JS Loaded OK"); // Uncomment to verify basic load
    // DOM Elements - Globals for inner scope
    let sidebar, mapContainer, svgElement;
    // Vars initialized later or globally
    const closeSidebarBtn = document.getElementById('close-sidebar');
    const citySearch = document.getElementById('city-search');
    const datalist = document.getElementById('cities-list');
    const themeToggle = document.getElementById('theme-toggle');
    const tooltip = document.getElementById('tooltip');

    // Controls
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    const visModeSelect = document.getElementById('vis-mode');
    const legendContainer = document.getElementById('map-legend');

    // Filters
    const filterParty = document.getElementById('filter-party');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const highlightCount = document.getElementById('highlight-count');

    // Estado da Aplicação (Login removido/Aberto)
    // Estado da Aplicação
    let isLoggedIn = false;
    let authToken = null;
    let activeCityId = null;
    let citiesData = {};
    let campaignData = {};
    let eleitoradoData = {};
    // Novo: Armazenar votos por cidade e ano
    // Estrutura: { 'cidade-slug': [{ ano: 2024, votos: 15000 }, ...] }
    let votosData = {};
    let chartVotosEvolucao = null;
    let chartVotosCrescimento = null;
    let filters = {
        party: 'all'
    };
    let currentVisMode = 'none';

    // Cores dos Partidos (Oficiais/Aproximadas)
    const PARTY_COLORS = {
        "PSD": "#F59E0B",   // Amarelo/Laranja forte
        "PP": "#0EA5E9",    // Azul Claro
        "MDB": "#16A34A",   // Verde
        "PL": "#172554",    // Azul Marinho Escuro
        "União Brasil": "#f6ff00fa", // Teal/Turquesa (bem distinto)
        "PSB": "#CA8A04",   // Dourado/Mostarda (mais visível que amarelo)
        "Republicanos": "#7C3AED", // Roxo/Violeta (distinto)
        "PODE": "#84CC16",  // Verde Lima (bem distinto do MDB)
        "PRD": "#475569",   // Cinza Azulado
        "NOVO": "#EA580C",  // Laranja
        "CIDADANIA": "#DB2777", // Rosa/Magenta
        "SOLIDARIEDADE": "#D97706", // Laranja Queimado
        "PSDB": "#0470c2ff",  // Azul Médio
        "PT": "#DC2626",    // Vermelho
        "PDT": "#771515ff",   // Vermelho Escuro
        "AVANTE": "#7C3AED", // Roxo (Just in case)
        "Podemos": "#ed3a9cff",
        "Outros": "#94A3B8",
        "Não informado": "#CBD5E1"
    };

    const PARTIES = Object.keys(PARTY_COLORS).filter(k => k !== 'Outros' && k !== 'Não informado');

    // Pan/Zoom State
    let scale = 1;
    let pointX = 0;
    let pointY = 0;
    let isDragging = false;
    let startX, startY;

    // Check Protocol immediately (Optional, can be relaxed now)
    if (window.location.protocol === 'file:' && !document.getElementById('mapa-pr')) {
        // Keep warning only if SVG is MISSING
        mapContainer.innerHTML = `...`;
        return;
    }

    try {
        // 1. Get Embedded SVG or Fallback
        svgElement = document.getElementById('mapa-pr');

        if (!svgElement) {
            // Fallback: Tenta fetch se não estiver embutido (caso o python falhe)
            console.log("SVG not found in DOM, fetching...");
            const svgResponse = await fetch('mapa_pr.svg');
            if (!svgResponse.ok) throw new Error(`Erro SVG: ${svgResponse.status}`);
            const svgText = await svgResponse.text();

            const mapSvgLayer = document.getElementById('map-svg-layer') || mapContainer;
            mapSvgLayer.innerHTML = svgText;
            svgElement = document.getElementById('mapa-pr');
        }

        if (!svgElement) throw new Error("SVG do mapa não pôde ser carregado.");

        // 2. Setup mapGroup link
        mapGroup = svgElement.querySelector('g') || svgElement;

        // 3. Load Data
        const jsonResponse = await fetch('cidades_pr.json?v=20260116');
        if (!jsonResponse.ok) throw new Error(`Erro JSON: ${jsonResponse.status}`);
        citiesData = await jsonResponse.json();

        initApp();
    } catch (error) {
        console.error("Error initializing:", error);
        mapContainer.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; color:var(--text-secondary); text-align:center; padding:1rem;">
                <div style="font-size:3rem; margin-bottom:1rem;">❌</div>
                <h3 style="color:var(--text-primary); margin-bottom:0.5rem;">Erro de Inicialização</h3>
                <p style="color:#ef4444; font-family:monospace; background:rgba(239, 68, 68, 0.1); padding:0.5rem; border-radius:4px; margin-bottom:1rem;">
                    ${error.message}
                </p>
                <p>Verifique se os arquivos 'mapa_pr.svg' e 'cidades_pr.json' estão na pasta correta.</p>
                <a href="http://localhost:8082" style="margin-top:1rem; color:var(--accent-color); font-weight:600;">Tentar novamente em 8082</a>
            </div>
        `;
    }

    // State duplicado removido
    // As variáveis globais já foram declaradas no topo do arquivo.
    let chartInstances = {};
    // isLoggedIn e authToken já existem.



    // --- Search Logic ---
    window.filterCities = function (query) {
        if (!svgElement) svgElement = document.getElementById('map-svg-layer'); // Ensure valid ref

        if (!query) {
            // search reset
            const paths = svgElement.querySelectorAll('path');
            paths.forEach(p => {
                p.classList.remove('dimmed', 'highlight-filter');
                p.style.display = ''; // Show all
            });
            if (highlightCount) highlightCount.innerText = "399";
            return;
        }

        const lowerQuery = query.toLowerCase();
        let matches = 0;
        const paths = svgElement.querySelectorAll('path');

        paths.forEach(path => {
            const city = citiesData[path.id];
            if (city && city.nome.toLowerCase().includes(lowerQuery)) {
                path.classList.remove('dimmed');
                path.classList.add('highlight-filter');
                path.style.display = '';
                matches++;
                if (matches === 1) {
                    // can zoom to first
                }
            } else {
                path.classList.add('dimmed');
                path.classList.remove('highlight-filter');
                // Optional: hide non-matches or just dim? 
                // path.style.display = 'none'; // Keeping them visible but dimmed is better for context
            }
        });

        if (highlightCount) highlightCount.innerText = matches;
    }

    async function initApp() {
        // Setup Mobile Toggles
        setupMobileInteractions();

        // Theme Toggle Fix
        setupThemeToggle();

        // Initialize Globals
        sidebar = document.getElementById('sidebar'); // City details sidebar
        mapContainer = document.getElementById('map-container');

        injectMockData(); // Ensure complete data coverage
        initFilters();    // Populate dropdowns and setup ranges
        initMapInteractions();
        initSearch(); // Call improved search init
        setupZoomPan();
        initTabs();       // Sistema de abas
        loadEleitoradoData(); // Carrega dados eleitorais

        // Novos Inicializadores de Campanha/Login
        initLogin();
        await loadCampaignGlobalStats();
        initDraggableModals();

        // Initial Render
        updateMapDisplay();
    }

    function setupThemeToggle() {
        const themeBtn = document.getElementById('theme-toggle');
        if (themeBtn) {
            // Remove listeners antigos cloning
            const newBtn = themeBtn.cloneNode(true);
            themeBtn.parentNode.replaceChild(newBtn, themeBtn);

            newBtn.addEventListener('click', () => {
                const isDark = document.body.getAttribute('data-theme') === 'dark';
                document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
                // newBtn.textContent = isDark ? '🌙' : '☀️'; // Opz, ícones podem ser fixos ou mudar
            });
        }
    }

    function setupMobileInteractions() {
        const toggleBtn = document.getElementById('toggle-filters-btn');
        const leftSidebar = document.getElementById('left-sidebar');
        const mobileOverlay = document.getElementById('mobile-overlay');

        if (!toggleBtn || !leftSidebar) return;

        // Toggle sidebar when button is clicked
        toggleBtn.addEventListener('click', () => {
            const isOpen = leftSidebar.classList.contains('open');

            if (isOpen) {
                leftSidebar.classList.remove('open');
                toggleBtn.classList.remove('active');
                toggleBtn.innerHTML = '☰';
                toggleBtn.setAttribute('aria-label', 'Abrir Filtros');
                if (mobileOverlay) mobileOverlay.classList.remove('visible');
            } else {
                leftSidebar.classList.add('open');
                toggleBtn.classList.add('active');
                toggleBtn.innerHTML = '✕';
                toggleBtn.setAttribute('aria-label', 'Fechar Filtros');
                if (mobileOverlay) mobileOverlay.classList.add('visible');
            }
        });

        // Close sidebar when overlay is clicked
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                leftSidebar.classList.remove('open');
                toggleBtn.classList.remove('active');
                toggleBtn.innerHTML = '☰';
                toggleBtn.setAttribute('aria-label', 'Abrir Filtros');
                mobileOverlay.classList.remove('visible');
            });
        }

        // Close sidebar when a filter is selected (better UX on mobile)
        const filterSelects = leftSidebar.querySelectorAll('select');
        filterSelects.forEach(select => {
            select.addEventListener('change', () => {
                // Small delay to let the user see the selection
                setTimeout(() => {
                    if (window.innerWidth <= 768) {
                        leftSidebar.classList.remove('open');
                        toggleBtn.classList.remove('active');
                        toggleBtn.innerHTML = '☰';
                        if (mobileOverlay) mobileOverlay.classList.remove('visible');
                    }
                }, 300);
            });
        });

        // Handle window resize - close sidebar if window is enlarged
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                leftSidebar.classList.remove('open');
                toggleBtn.classList.remove('active');
                toggleBtn.innerHTML = '☰';
                if (mobileOverlay) mobileOverlay.classList.remove('visible');
            }
        });
    }

    // --- Draggable Modals ---
    function initDraggableModals() {
        const modals = document.querySelectorAll('.modal-content');

        modals.forEach(modal => {
            const header = modal.querySelector('.modal-header') || modal.querySelector('h2'); // h2 for login modal
            if (!header) return;

            header.style.cursor = 'move';

            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = 0;
            let yOffset = 0;

            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mouseup', dragEnd);
            document.addEventListener('mousemove', drag);

            function dragStart(e) {
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;

                if (e.target === header || header.contains(e.target)) {
                    isDragging = true;
                }
            }

            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;

                    xOffset = currentX;
                    yOffset = currentY;

                    setTranslate(currentX, currentY, modal);
                }
            }

            function setTranslate(xPos, yPos, el) {
                el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
            }
        });
    }

    // --- Auth & Campaign Logic ---
    function initLogin() {
        const loginBtn = document.getElementById('login-btn');
        const loginModal = document.getElementById('login-modal');
        const closeLogin = document.getElementById('close-login');
        const btnPerform = document.getElementById('btn-perform-login');

        // Abre modal
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent any weird default behaviors
                if (isLoggedIn) {
                    // Logout simples
                    isLoggedIn = false;
                    loginBtn.innerText = "Entrar";
                    document.getElementById('campaign-stats').classList.add('hidden');

                    // Esconde a aba de campanha
                    const tabBtnCampaign = document.getElementById('tab-btn-campaign');
                    if (tabBtnCampaign) {
                        tabBtnCampaign.classList.add('hidden');
                    }

                    const tabBtnInsights = document.getElementById('tab-btn-insights');
                    if (tabBtnInsights) {
                        tabBtnInsights.classList.add('hidden');
                    }

                    const activeTab = document.querySelector('.tab-btn.active');
                    if (activeTab && (activeTab.dataset.tab === 'campaign' || activeTab.dataset.tab === 'insights')) {
                        document.querySelector('.tab-btn[data-tab="info"]').click();
                    }

                    toggleCampaignVisualizations(false);

                    // Limpa campos de input para garantir
                    document.getElementById('input-votes').value = "";
                    document.getElementById('input-money').value = "";

                    // Limpa textos de insights
                    ['ins-votes', 'ins-money', 'ins-conversion', 'ins-cost-vote', 'ins-cost-pop', 'ins-share'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.innerText = "-";
                    });

                    alert("Você saiu do sistema.");
                } else {
                    loginModal.classList.remove('hidden');
                    loginModal.style.display = ''; // Limpa inline style (setado/fechado por performLogin)
                }
            });
        }

        // Fecha modal
        if (closeLogin) {
            closeLogin.addEventListener('click', () => {
                loginModal.classList.add('hidden');
                document.getElementById('login-msg').innerText = "";
            });
        }

        // Ação de Login (Form Submit - Robust "Enter" support)
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault(); // Stop page reload
                performLogin();
            });
        }

        // Manual keyup removed

        // Salvar Campanha
        const btnSave = document.getElementById('btn-save-campaign');
        if (btnSave) {
            btnSave.addEventListener('click', saveCampaignData);
        }
    }

    async function performLogin() {
        const user = (document.getElementById('login-user').value || '').trim();
        const pass = (document.getElementById('login-pass').value || '').trim();
        const msg = document.getElementById('login-msg');

        // Feedback visual imediato
        msg.innerText = "Verificando credenciais...";
        msg.style.color = "var(--text-secondary)";

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: user, password: pass })
            });

            if (res.ok) {
                const data = await res.json();
                isLoggedIn = true;
                authToken = data.token;

                // Força o fechamento do modal
                const modal = document.getElementById('login-modal');
                if (modal) {
                    modal.classList.add('hidden'); // CSS class
                    modal.style.display = 'none';  // Inline styles fallback
                }

                document.getElementById('login-btn').innerText = "Sair";
                document.getElementById('campaign-stats').classList.remove('hidden');
                document.getElementById('campaign-stats').style.display = 'flex'; // Ensure visibility

                // Exibe a aba de campanha
                const tabBtnCampaign = document.getElementById('tab-btn-campaign');
                if (tabBtnCampaign) {
                    tabBtnCampaign.classList.remove('hidden');
                    tabBtnCampaign.click(); // Auto-select tab
                }

                const tabBtnInsights = document.getElementById('tab-btn-insights');
                if (tabBtnInsights) {
                    tabBtnInsights.classList.remove('hidden');
                }

                // Limpa mensagem
                msg.innerText = "";

                // Atualiza UI se tiver cidade selecionada
                if (activeCityId && typeof populateSidebar === 'function') {
                    populateSidebar(activeCityId);
                }

                // Carrega dados globais
                loadCampaignGlobalStats();
                toggleCampaignVisualizations(true);

            } else {
                msg.style.color = "#ef4444"; // Red
                if (res.status === 401) {
                    msg.innerText = "Usuário ou senha incorretos.";
                } else {
                    msg.innerText = `Erro no servidor: ${res.status}`;
                }
            }
        } catch (e) {
            console.error(e);
            msg.style.color = "#ef4444";
            msg.innerText = "Erro de conexão. Verifique o terminal.";
        }
    }

    async function loadCampaignGlobalStats() {
        try {
            const res = await fetch('/api/campaign/data');
            if (res.ok) {
                campaignData = await res.json(); // Atualiza cache

                let totalVotes = 0;
                let totalMoney = 0;

                Object.values(campaignData).forEach(c => {
                    totalVotes += (c.votes || 0);
                    totalMoney += (c.money || 0);
                });

                document.getElementById('global-votes').innerText = totalVotes.toLocaleString('pt-BR');
                document.getElementById('global-money').innerText = totalMoney.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            }
        } catch (e) {
            console.warn("Erro ao carregar stats globais:", e);
        }
    }

    function updateSidebarCampaign(slug) {
        if (!isLoggedIn) return;

        document.getElementById('save-msg').innerText = "";

        // Preencher dados se existirem no cache
        const data = campaignData[slug] || { votes: 0, money: 0 };

        const inputVotes = document.getElementById('input-votes');
        const inputMoney = document.getElementById('input-money');

        if (inputVotes) inputVotes.value = data.votes || 0;
        if (inputMoney) inputMoney.value = data.money || 0;
    }

    async function saveCampaignData() {
        if (!activeCityId) return;

        const votes = parseInt(document.getElementById('input-votes').value) || 0;
        const money = parseFloat(document.getElementById('input-money').value) || 0;
        const msg = document.getElementById('save-msg');

        try {
            const res = await fetch('/api/campaign/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city_slug: activeCityId,
                    votes: votes,
                    money: money
                })
            });

            if (res.ok) {
                msg.style.color = 'green';
                msg.innerText = "Salvo com sucesso!";

                // Atualiza cache e totais
                campaignData[activeCityId] = { votes, money };
                loadCampaignGlobalStats();

                // Atualiza Insights e Mapa
                if (typeof updateInsights === 'function') {
                    updateInsights(activeCityId);
                }
                updateMapDisplay();
            } else {
                msg.style.color = 'red';
                msg.innerText = "Erro ao salvar.";
            }
        } catch (e) {
            msg.style.color = 'red';
            msg.innerText = "Erro de conexão.";
        }
    }

    // Carrega dados eleitorais do TSE
    async function loadEleitoradoData() {
        try {
            const response = await fetch('dados_eleitorais.json');
            if (response.ok) {
                eleitoradoData = await response.json();
            }
        } catch (e) {
            console.warn('Dados eleitorais não encontrados:', e);
        }
    }

    // Sistema de Abas
    function initTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');

                // Remove active de todos
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));

                // Ativa o clicado
                btn.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }

    // --- 1. Data Management ---
    function injectMockData() {
        const paths = svgElement.querySelectorAll('path');

        paths.forEach(path => {
            const id = path.id;

            // Create base object if missing
            if (!citiesData[id]) {
                citiesData[id] = {
                    nome: path.getAttribute('data-name') || id,
                    descricao: "Município do estado do Paraná."
                };
            }

            const city = citiesData[id];

            // Deterministic assignment for Party (stable across reloads)
            if (!city.partido || city.partido === "Não informado") {
                let hash = 0;
                for (let i = 0; i < id.length; i++) hash += id.charCodeAt(i);
                city.partido = PARTIES[Math.abs(hash) % PARTIES.length];
            }

            // Weighted Random Population
            if (!city.habitantes) {
                const r = Math.random();
                let pop;
                if (r > 0.98) pop = 300000 + Math.random() * 1500000; // Curitiba/Londrina scale
                else if (r > 0.90) pop = 50000 + Math.random() * 250000;
                else pop = 2000 + Math.random() * 48000;
                city.habitantes = Math.floor(pop);
            }

            // Area
            if (!city.area_km2) {
                city.area_km2 = Math.floor(Math.random() * 1500) + 100;
            }

            // Derived and Additional Mock Data
            if (!city.densidade) city.densidade = (city.habitantes / city.area_km2).toFixed(2);

            // PIB per capita
            if (!city.pib_per_capita) {
                // Extrai do campo economia se existir
                if (city.economia && city.economia.includes('PIB per Capita')) {
                    const match = city.economia.match(/R\$\s*([\d.,]+)/);
                    if (match) {
                        city.pib_per_capita = parseFloat(match[1].replace('.', '').replace(',', '.'));
                    }
                }
                // Se ainda não tiver, gera valor aleatório baseado na população
                if (!city.pib_per_capita) {
                    const basePib = 20000 + Math.random() * 80000;
                    city.pib_per_capita = parseFloat(basePib.toFixed(2));
                }
            }

            // IDHM
            if (!city.idhm) {
                city.idhm = (0.65 + Math.random() * 0.15).toFixed(3);
            }

            // Gentílico
            if (!city.gentilico) {
                city.gentilico = "Não informado";
            }

            // Aniversário
            if (!city.aniversario) {
                city.aniversario = "Não informado";
            }

            // Mock Political Data (if missing)
            if (!city.prefeito) city.prefeito = "Prefeito não informado";
            if (!city.vice_prefeito) city.vice_prefeito = "Vice não informado";
        });
    }

    function initFilters() {
        // Populate Party Dropdown Dynamically
        if (filterParty) {
            filterParty.innerHTML = '<option value="all">Todos</option>';
            PARTIES.sort().forEach(party => {
                const opt = document.createElement('option');
                opt.value = party;
                opt.innerText = party;
                filterParty.appendChild(opt);
            });
        }
    }


    // --- 2. Unified Map Display Logic ---
    function updateMapDisplay() {
        const paths = svgElement.querySelectorAll('path');
        let matchCount = 0;

        // Prepare Visualization Data
        let minVal = Infinity, maxVal = -Infinity;
        let dataField = null;
        let useCampaignData = false;
        let campaignField = null;
        let filteredCities = [];

        if (currentVisMode === 'heatmap-pop') {
            dataField = 'habitantes';
        } else if (currentVisMode === 'heatmap-pib') {
            dataField = 'pib_per_capita';
        } else if (currentVisMode === 'heatmap-votes') {
            useCampaignData = true;
            campaignField = 'votes';
        } else if (currentVisMode === 'heatmap-money') {
            useCampaignData = true;
            campaignField = 'money';
        }

        if (dataField || useCampaignData) {
            Object.keys(citiesData).forEach(slug => {
                let val = 0;
                if (useCampaignData) {
                    const cData = campaignData[slug] || { votes: 0, money: 0 };
                    val = parseFloat(cData[campaignField]) || 0;
                } else {
                    val = parseFloat(citiesData[slug][dataField]) || 0;
                }

                if (val < minVal) minVal = val;
                if (val > maxVal) maxVal = val;
            });
            if (minVal === maxVal) maxVal = minVal + 1;
        }

        paths.forEach(path => {
            const city = citiesData[path.id];
            if (!city) return;

            // 1. Check Filters
            let isMatch = true;
            if (filters.party !== 'all' && city.partido !== filters.party) isMatch = false;

            // 2. Apply Base Visualization Color
            let fill = '';
            if (currentVisMode === 'party') {
                fill = PARTY_COLORS[city.partido] || '#ccc';
            } else if (dataField || useCampaignData) {
                let val = 0;
                if (useCampaignData) {
                    const cData = campaignData[path.id] || { votes: 0, money: 0 };
                    val = parseFloat(cData[campaignField]) || 0;
                } else {
                    val = parseFloat(city[dataField]) || 0;
                }

                // 1. Zero check - Gray color
                if (val === 0) {
                    fill = '#e5e7eb'; // Light Gray
                } else {
                    let ratio = 0;

                    // 2. Rank-Based Scaling for Pop/PIB (Guarantees distribution)
                    if (dataField === 'habitantes' || dataField === 'pib_per_capita') {
                        if (!window.mapSortedValues || window._sortedCacheKey !== dataField) {
                            // Create cache of sorted positive values
                            const values = Object.values(citiesData)
                                .map(c => parseFloat(c[dataField]) || 0)
                                .filter(v => v > 0)
                                .sort((a, b) => a - b);
                            window.mapSortedValues = values;
                            window._sortedCacheKey = dataField;
                        }

                        // Find rank
                        const sorted = window.mapSortedValues;
                        let rank = 0;
                        let lo = 0, hi = sorted.length - 1;
                        while (lo <= hi) {
                            const mid = (lo + hi) >> 1;
                            if (sorted[mid] < val) lo = mid + 1;
                            else hi = mid - 1;
                        }
                        rank = lo;

                        ratio = rank / Math.max(sorted.length - 1, 1);

                    } else {
                        // Linear (Campanha)
                        if (maxVal > minVal) {
                            ratio = (val - minVal) / (maxVal - minVal);
                        }
                    }
                    fill = getHeatmapColor(ratio);
                }
            }

            // 3. Apply Styles to DOM
            if (fill) {
                path.style.fill = fill;
            } else {
                path.style.fill = ''; // Revert to CSS default
            }

            if (isMatch) {
                path.classList.remove('dimmed');
                path.classList.add('highlight-filter');
                matchCount++;
                filteredCities.push({
                    nome: city.nome,
                    partido: city.partido
                });
            } else {
                path.classList.add('dimmed');
                path.classList.remove('highlight-filter');
            }
        });

        // Ordena cidades
        filteredCities.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // Update UI
        if (highlightCount) highlightCount.innerText = matchCount;
        updateLegend(minVal, maxVal, (dataField || campaignField), filteredCities);

        if (currentVisMode !== 'none') {
            mapContainer.classList.add('visualizing');
            // Force Light Background as requested
            mapContainer.style.backgroundColor = '#e2e8f0';
        }
        else {
            mapContainer.classList.remove('visualizing');
            mapContainer.style.backgroundColor = ''; // Revert to CSS default
        }
        // Prevent background change (User request #4)
        // mapContainer.style.backgroundColor = ''; // Reset if needed, or rely on CSS not handling .visualizing for BG anymore

        const hasFilters = filters.party !== 'all';
        if (hasFilters) mapContainer.classList.add('filtering');
        else mapContainer.classList.remove('filtering');
    }

    // Heatmap: "Turbo-like" Rainbow spectrum for high contrast
    function getHeatmapColor(t) {
        // 0.0 (Low) -> 1.0 (High)
        // Purple -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> Dark Red
        if (t < 0.14) return interpolateColor('#4c1d95', '#3b82f6', t / 0.14);          // Roxo Escuro -> Azul
        if (t < 0.28) return interpolateColor('#3b82f6', '#06b6d4', (t - 0.14) / 0.14);  // Azul -> Ciano
        if (t < 0.42) return interpolateColor('#06b6d4', '#22c55e', (t - 0.28) / 0.14);  // Ciano -> Verde
        if (t < 0.57) return interpolateColor('#22c55e', '#eab308', (t - 0.42) / 0.15);  // Verde -> Amarelo
        if (t < 0.71) return interpolateColor('#eab308', '#f97316', (t - 0.57) / 0.14);  // Amarelo -> Laranja
        if (t < 0.85) return interpolateColor('#f97316', '#dc2626', (t - 0.71) / 0.14);  // Laranja -> Vermelho
        return interpolateColor('#dc2626', '#7f1d1d', (t - 0.85) / 0.15);                // Vermelho -> Vinho
    }

    function interpolateColor(c1, c2, factor) {
        const parse = c => c.match(/\w\w/g).map(x => parseInt(x, 16));
        const [r1, g1, b1] = parse(c1);
        const [r2, g2, b2] = parse(c2);

        const r = Math.round(r1 + factor * (r2 - r1));
        const g = Math.round(g1 + factor * (g2 - g1));
        const b = Math.round(b1 + factor * (b2 - b1));
        return `rgb(${r},${g},${b})`;
    }

    function updateLegend(min, max, dataField, filteredCities = []) {
        // Find or create legend container in Left Sidebar
        let leftSidebarLegend = document.getElementById('sidebar-legend-container');
        if (!leftSidebarLegend) {
            const sidebar = document.querySelector('.left-sidebar');
            leftSidebarLegend = document.createElement('div');
            leftSidebarLegend.id = 'sidebar-legend-container';
            leftSidebarLegend.className = 'sidebar-section legend-box';
            sidebar.appendChild(leftSidebarLegend);
        }

        leftSidebarLegend.innerHTML = '';
        leftSidebarLegend.classList.add('hidden');

        // Also clear the map-absolute legend just in case (we are moving it)
        legendContainer.innerHTML = '';
        legendContainer.classList.add('hidden');

        if (currentVisMode === 'party') {
            leftSidebarLegend.innerHTML = '<h3>Legenda</h3>';

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr'; // List view usually looks better in sidebar
            grid.style.gap = '6px';

            // Calculate counts per party
            const partyCounts = {};
            let missingPartyCount = 0;

            Object.values(citiesData).forEach(city => {
                const p = city.partido ? city.partido.trim() : null;
                if (p && p !== 'null' && p !== 'undefined') {
                    partyCounts[p] = (partyCounts[p] || 0) + 1;
                } else {
                    missingPartyCount++;
                    // console.warn('Missing party for:', city.nome); // Debug
                }
            });

            // Filter parties with count > 0 and sort frequencies or alphabetical?
            // User asked: "Deixe aparecendo somente os partidos políticos que possuem valores"
            const activeParties = Object.keys(partyCounts).filter(p => partyCounts[p] > 0);

            // Sort by count desc
            activeParties.sort((a, b) => partyCounts[b] - partyCounts[a]);

            activeParties.forEach(label => {
                const color = PARTY_COLORS[label] || '#999';
                const count = partyCounts[label];

                const div = document.createElement('div');
                div.className = 'legend-item';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                div.style.fontSize = '0.85rem';

                div.innerHTML = `
                    <div class="legend-color" style="background:${color}; width:12px; height:12px; border-radius:2px; margin-right:8px;"></div>
                    <span style="flex:1; color:var(--text-primary);">${label}</span>
                    <span style="font-weight:600; color:var(--text-secondary); margin-left:4px;">${count}</span>
                `;
                grid.appendChild(div);
            });

            // Handle cities without party if any (fixing issue #3 visual)
            if (missingPartyCount > 0) {
                const div = document.createElement('div');
                div.className = 'legend-item';
                div.innerHTML = `<div class="legend-color" style="background:#cbd5e1; width:12px; height:12px; border-radius:2px; margin-right:8px;"></div><span>Sem Partido</span><span style="font-weight:600; margin-left:auto;">${missingPartyCount}</span>`;
                grid.appendChild(div);
            }

            leftSidebarLegend.appendChild(grid);
            leftSidebarLegend.classList.remove('hidden');

        } else if (dataField || currentVisMode.startsWith('heatmap')) {
            // For Heatmaps, displaying in Sidebar is also cleaner
            let title = '';
            let formatFn;

            if (currentVisMode === 'heatmap-pop' || dataField === 'habitantes') {
                title = 'Habitantes';
                formatFn = (v) => v.toLocaleString('pt-BR');
            } else if (currentVisMode === 'heatmap-pib' || dataField === 'pib_per_capita') {
                title = 'PIB per capita';
                formatFn = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else if (currentVisMode === 'heatmap-votes' || dataField === 'votes') {
                title = 'Campanha: Total de Votos';
                formatFn = (v) => Math.round(v).toLocaleString('pt-BR');
            } else if (currentVisMode === 'heatmap-money' || dataField === 'money') {
                title = 'Campanha: Investimento Total';
                formatFn = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            } else {
                return; // Unknown mode
            }

            leftSidebarLegend.innerHTML = `<h3>${title}</h3>`;
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.gap = '8px';

            // Container para a barra com evento
            const barContainer = document.createElement('div');
            barContainer.style.position = 'relative';
            barContainer.style.height = '16px';
            barContainer.style.marginBottom = '4px';

            const bar = document.createElement('div');
            bar.style.width = '100%';
            bar.style.height = '100%';
            bar.style.background = 'linear-gradient(to right, #4c1d95, #3b82f6, #06b6d4, #22c55e, #eab308, #f97316, #dc2626, #7f1d1d)';
            bar.style.borderRadius = '4px';
            bar.style.cursor = 'crosshair';

            // Eventos da régua (Tooltip)
            bar.addEventListener('mousemove', (e) => {
                const rect = bar.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const pct = x / rect.width;

                let val = 0;
                // Reverse calculation Logic
                if ((currentVisMode === 'heatmap-pop' || currentVisMode === 'heatmap-pib') && window.mapSortedValues) {
                    const idx = Math.floor(pct * (window.mapSortedValues.length - 1));
                    val = window.mapSortedValues[idx];
                } else {
                    val = min + pct * (max - min);
                    if (max > min * 100) {
                        const minLog = Math.log(Math.max(min, 1));
                        const maxLog = Math.log(Math.max(max, 1));
                        val = Math.exp(minLog + pct * (maxLog - minLog));
                    }
                }

                const tooltip = document.getElementById('tooltip');
                tooltip.style.left = e.pageX + 15 + 'px';
                tooltip.style.top = e.pageY + 15 + 'px';
                tooltip.innerHTML = `<strong>${formatFn(val)}</strong>`;
                tooltip.classList.remove('hidden');
            });

            bar.addEventListener('mouseleave', () => {
                document.getElementById('tooltip').classList.add('hidden');
            });

            barContainer.appendChild(bar);
            div.appendChild(barContainer);

            const rangeLabels = document.createElement('div');
            rangeLabels.style.display = 'flex';
            rangeLabels.style.justifyContent = 'space-between';
            rangeLabels.style.fontSize = '0.75rem';
            rangeLabels.style.color = 'var(--text-secondary)';
            rangeLabels.innerHTML = `<span>${formatFn(min)}</span><span>${formatFn(max)}</span>`;
            div.appendChild(rangeLabels);

            leftSidebarLegend.appendChild(div);
            leftSidebarLegend.classList.remove('hidden');
        }

        // Logic for Filtered Cities List (Show when filtering by party)
        if (filters.party !== 'all') {
            // Re-calculate filtered cities if empty (fallback)
            if (filteredCities.length === 0) {
                Object.values(citiesData).forEach(city => {
                    if (city.partido === filters.party) filteredCities.push(city);
                });
                filteredCities.sort((a, b) => a.nome.localeCompare(b.nome));
            }
            updateFilteredCitiesList(filteredCities);
        } else {
            const existingList = document.getElementById('filtered-cities-panel');
            if (existingList) existingList.remove();
        }
    }

    function toggleCampaignVisualizations(show) {
        const visSelect = document.getElementById('vis-mode');
        if (!visSelect) return;

        // IDs of campaign options
        const CAMPAIGN_OPTS = ['heatmap-votes', 'heatmap-money'];

        if (show) {
            // Check if they exist, if not add them
            if (!visSelect.querySelector('option[value="heatmap-votes"]')) {
                const opt1 = document.createElement('option');
                opt1.value = 'heatmap-votes';
                opt1.innerText = 'Total de Votos (Mapa de Calor)';
                opt1.style.color = '#dc2626'; // Highlight as admin feature
                visSelect.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = 'heatmap-money';
                opt2.innerText = 'Investimento Total (Mapa de Calor)';
                opt2.style.color = '#dc2626';
                visSelect.appendChild(opt2);
            }
        } else {
            // Se o modo atual for restrito, reseta para padrão antes de remover as opções
            if (CAMPAIGN_OPTS.includes(currentVisMode) || CAMPAIGN_OPTS.includes(visSelect.value)) {
                visSelect.value = 'none';
                currentVisMode = 'none';
                updateMapDisplay();
            }

            // Remove options
            CAMPAIGN_OPTS.forEach(val => {
                const opt = visSelect.querySelector(`option[value="${val}"]`);
                if (opt) opt.remove();
            });
        }
    }

    // Função para mostrar lista de cidades filtradas
    function updateFilteredCitiesList(cities) {
        let panel = document.getElementById('filtered-cities-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'filtered-cities-panel';
            // Styling directly here for robustness, or usually in CSS
            panel.style.position = 'absolute';
            panel.style.top = '70px'; // Below header
            panel.style.left = '320px'; // Right of sidebar
            panel.style.width = '250px';
            panel.style.background = 'var(--card-bg, white)';
            panel.style.border = '1px solid var(--border-color, #ccc)';
            panel.style.borderRadius = '8px';
            panel.style.padding = '15px';
            panel.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            panel.style.zIndex = '900';
            panel.style.maxHeight = 'calc(100vh - 100px)';
            panel.style.display = 'flex';
            panel.style.flexDirection = 'column';

            // Responsive adjust
            if (window.innerWidth <= 1024) {
                panel.style.left = '20px';
                panel.style.width = 'calc(100% - 40px)';
                panel.style.top = '140px'; // Lower
            }

            document.body.appendChild(panel);
        }

        const partyColor = PARTY_COLORS[filters.party] || '#666';

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid ${partyColor};">
                <strong style="font-size:1rem; color:var(--text-primary, #333);">Cidades - ${filters.party}</strong>
                <span style="background:${partyColor}; color:white; padding:2px 8px; border-radius:12px; font-size:0.85rem;">${cities.length}</span>
                <button onclick="document.getElementById('filtered-cities-panel').remove()" style="background:none; border:none; cursor:pointer; font-size:1.2rem; color:var(--text-secondary);">&times;</button>
            </div>
            <div style="max-height: 400px; overflow-y: auto;">
                <ul style="list-style:none; padding:0; margin:0; font-size:0.9rem;">
                ${cities.map(c => `
                    <li style="padding:6px 0; border-bottom:1px solid var(--border-color, #f0f0f0); cursor:pointer; transition:background 0.2s; color:var(--text-primary, #333);" 
                        onmouseover="this.style.background='var(--bg-secondary, #f9fafb)'; this.style.color='var(--accent-color, #2563eb)'" 
                        onmouseout="this.style.background='transparent'; this.style.color='var(--text-primary, #333)'"
                        onclick="document.getElementById('city-search').value='${c.nome}'; document.getElementById('city-search').dispatchEvent(new Event('change'));">
                        ${c.nome}
                    </li>
                `).join('')}
                </ul>
            </div>
        `;
    }


    // --- 3. Events ---
    function initMapInteractions() {
        const paths = svgElement.querySelectorAll('path');
        paths.forEach(path => {
            path.addEventListener('click', (e) => {
                e.stopPropagation();
                selectCity(path.id); // Robust selection
                console.log('Clicked:', path.id); // Debug Log
            });
            path.addEventListener('mouseenter', (e) => showTooltip(citiesData[path.id]?.nome || path.id, e));
            path.addEventListener('mouseleave', hideTooltip);
            path.addEventListener('mousemove', moveTooltip);
        });

        svgElement.addEventListener('click', (e) => {
            if (e.target.tagName !== 'path') closeSidebar();
        });

        // Controls
        if (visModeSelect) {
            visModeSelect.addEventListener('change', () => {
                currentVisMode = visModeSelect.value;
                updateMapDisplay();
            });
        }

        // Filters
        const handleFilterChange = () => {
            filters.party = filterParty.value;
            updateMapDisplay();
        };

        if (filterParty) filterParty.addEventListener('change', handleFilterChange);

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                filterParty.value = 'all';
                visModeSelect.value = 'none';

                filters = { party: 'all' };
                currentVisMode = 'none';

                updateMapDisplay();
            });
        }
    }

    function selectCity(id) {
        if (!id) return;

        if (activeCityId) {
            const prev = document.getElementById(activeCityId);
            if (prev) prev.classList.remove('active');
        }
        activeCityId = id;
        const el = document.getElementById(id);
        if (el) el.classList.add('active');

        populateSidebar(id);
        sidebar.classList.add('open');
    }

    function populateSidebar(id) {
        // Robust Lookup: Case Insensitive
        let data = citiesData[id];

        if (!data) {
            // Try detecting case mismatches
            const lowerId = id.toLowerCase();
            const key = Object.keys(citiesData).find(k => k.toLowerCase() === lowerId);
            if (key) data = citiesData[key];
        }

        // Fallback
        if (!data) {
            data = {
                nome: id,
                descricao: "Dados indisponíveis."
            };
        }

        // Atualiza título e descrição
        document.getElementById('city-name').innerText = data.nome || "Cidade";
        document.getElementById('city-desc').innerText = data.descricao || "Sem descrição disponível.";

        // Função auxiliar para setar valores
        const set = (eid, val) => {
            const el = document.getElementById(eid);
            if (el) el.innerText = (val !== undefined && val !== null && val !== '' && val !== 'Não informado') ? val : '-';
        };

        // 1. Nome da cidade
        set('stat-nome', data.nome);

        // 2. Gentílico
        let gentilico = data.gentilico || '-';
        if (gentilico && gentilico !== '-' && gentilico !== 'Não informado') {
            // Capitaliza primeira letra
            gentilico = gentilico.charAt(0).toUpperCase() + gentilico.slice(1);
        }
        set('stat-gentilico', gentilico);

        // 3. Prefeito
        let prefeito = data.prefeito || '-';
        if (prefeito && prefeito !== '-' && prefeito !== 'Prefeito não informado') {
            // Formata nome do prefeito (capitaliza corretamente)
            prefeito = formatName(prefeito);
        }
        set('stat-prefeito', prefeito);

        // 5. Partido político
        set('stat-partido', data.partido);

        // 6. Habitantes
        const habitantes = data.habitantes
            ? parseInt(data.habitantes).toLocaleString('pt-BR')
            : '-';
        set('stat-habitantes', habitantes);

        // 7. Área
        const area = data.area_km2
            ? parseFloat(data.area_km2).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km²'
            : '-';
        set('stat-area', area);

        // 8. Densidade demográfica
        const densidade = data.densidade
            ? parseFloat(data.densidade).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' hab/km²'
            : '-';
        set('stat-densidade', densidade);

        // 9. IDHM
        const idhm = data.idhm
            ? parseFloat(data.idhm).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
            : '-';
        set('stat-idhm', idhm);

        // 10. PIB per capita
        let pib = '-';
        if (data.pib_per_capita) {
            pib = 'R$ ' + parseFloat(data.pib_per_capita).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else if (data.economia && data.economia.includes('PIB per Capita')) {
            // Extrai do campo economia
            const match = data.economia.match(/R\$\s*[\d.,]+/);
            if (match) pib = match[0];
        }
        set('stat-pib', pib);
        // Atualiza Aba de Eleitorado
        updateEleitoradoTab(id);

        // Atualiza Aba de Campanha (Admin)
        if (typeof updateSidebarCampaign === 'function') {
            updateSidebarCampaign(id);
        }

        // Atualiza Aba Insights (Admin)
        if (isLoggedIn && typeof updateInsights === 'function') {
            updateInsights(id);
        }
    }

    // Expose for debug
    window.eleitoradoData = eleitoradoData;
    window.updateEleitoradoTab = updateEleitoradoTab;

    // Atualiza gráficos e dados da aba eleitorado
    function updateEleitoradoTab(cityId) {
        if (!cityId) return;

        // Normaliza chave da cidade para buscar no JSON eleitoral
        // IDs do SVG geralmente já estão em snake_case e sem acentos, mas garantimos:
        // Se cityId for "Curitiba" -> "curitiba". Se "S. José" -> "s_jose" (exemplo)
        // O JSON usa: "curitiba", "sao_jose_dos_pinhais", etc.
        let key = cityId.toLowerCase().trim().replace(/-/g, '_');

        // Remove acentos caso o ID do SVG tenha escapado (ex: "vitoria")
        key = key.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        console.log(`[Eleitorado] Buscando dados para ID: "${cityId}" -> Chave: "${key}"`);

        const data = eleitoradoData[key];

        if (!data) {
            console.warn(`[Eleitorado] Dados não encontrados para a chave: "${key}". Verifique se o JSON foi carregado ou se a chave está correta.`);
            const totalEl = document.getElementById('total-eleitores');
            if (totalEl) totalEl.innerText = 'Indisponível';
            return;
        }

        console.log(`[Eleitorado] Dados encontrados para ${data.nome}. Total: ${data.total_eleitores}`);

        // 1. Total de Eleitores
        const totalEl = document.getElementById('total-eleitores');
        if (totalEl) totalEl.innerText = data.total_eleitores.toLocaleString('pt-BR');

        // Verifica se Chart.js está carregado
        if (typeof Chart === 'undefined') {
            console.error("[Eleitorado] Chart.js não está carregado!");
            return;
        }

        // 2. Gráficos
        renderChart('chart-genero', 'doughnut', data.genero, ['#3b82f6', '#ec4899', '#9ca3af'], ['Masculino', 'Feminino', 'Não Inf.'], false, data.total_eleitores);

        // Ordena faixas etárias
        const faixasOrder = [
            '16 anos', '17 anos', '18 anos', '19 anos', '20 anos',
            '21 a 24 anos', '25 a 29 anos', '30 a 34 anos', '35 a 39 anos',
            '40 a 44 anos', '45 a 49 anos', '50 a 54 anos', '55 a 59 anos',
            '60 a 64 anos', '65 a 69 anos', '70 a 74 anos', '75 a 79 anos',
            '80 a 84 anos', '85 a 89 anos', '90 a 94 anos', '95 a 99 anos',
            '100 anos ou mais'
        ];

        const faixaLabels = [];
        const maleValues = [];
        const femaleValues = [];

        // Filtra apenas faixas que existem
        faixasOrder.forEach(label => {
            if (data.faixa_etaria && data.faixa_etaria[label]) {
                const group = data.faixa_etaria[label];
                faixaLabels.push(label);
                // Masculino vai para a esquerda (negativo)
                maleValues.push((group.M || 0) * -1);
                // Feminino vai para a direita (positivo)
                femaleValues.push(group.F || 0);
            }
        });

        // Reverse to have youngest at bottom (Chart.js draws bottom-up on Y, or index 0 at bottom?)
        // Chart.js standard bar index/category axis usually starts from top (index 0) to bottom.
        // If we want Youngest (index 0) at Bottom, we probably actually need to REVERSE the arrays if the default matches array order Top-to-Bottom.
        // Let's check: '16 anos' is index 0. We want it at the BOTTOM.
        // Chart.js Category Scale: labels[0] is usually at the TOP (Left for horizontal? No, Top y-axis).
        // Wait, indexAxis: 'y' means Y is the category axis.
        // Usually, the first label is at the TOP.
        // We want '16 anos' (Index 0) at the base (BOTTOM).
        // So we should Reverse the arrays so '16 anos' becomes the last element?
        // Let's try reversing everything.

        faixaLabels.reverse();
        maleValues.reverse();
        femaleValues.reverse();

        renderPyramidChart('chart-idade', faixaLabels, maleValues, femaleValues, data.total_eleitores);

        // Grau de Instrução
        // Grau de Instrução
        if (data.grau_instrucao) {
            const instrucaoEntries = Object.entries(data.grau_instrucao).sort((a, b) => b[1] - a[1]); // Ordena por valor decrescente
            renderChart('chart-instrucao', 'bar',
                { labels: instrucaoEntries.map(e => e[0]), values: instrucaoEntries.map(e => e[1]) },
                '#10b981', null, false, data.total_eleitores); // Passe data.total_eleitores
        }

        // Estado Civil
        if (data.estado_civil) {
            renderChart('chart-civil', 'doughnut', data.estado_civil,
                ['#f59e0b', '#ef4444', '#6366f1', '#14b8a6', '#8b5cf6'],
                Object.keys(data.estado_civil), false, data.total_eleitores); // Passe data.total_eleitores e force horizontal=false
        }
    }

    function renderChart(canvasId, type, data, colors, labels = null, horizontal = false, totalAbsolute = null) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`[Eleitorado] Canvas ${canvasId} não encontrado.`);
            return;
        }

        const ctx = canvas.getContext('2d');

        // Destrói gráfico anterior se existir
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
        }

        let chartData, chartOptions;

        // Cor do texto baseada no tema (tenta pegar CSS var ou usa fallback)
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#666';

        if (type === 'doughnut') {
            // Prepara dados para Doughnut
            const dataValues = Object.values(data);
            const dataLabels = labels || Object.keys(data);

            chartData = {
                labels: dataLabels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: colors,
                    borderWidth: 0
                }]
            };

            chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            font: { size: 10 },
                            color: textColor
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                let value = context.parsed;
                                label += value + '%';
                                if (totalAbsolute) {
                                    const abs = Math.round((value / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                }
            };
        } else {
            // Bar Chart
            const isObj = !Array.isArray(data.values);
            const dataValues = isObj ? Object.values(data) : data.values;
            const dataLabels = isObj ? Object.keys(data) : data.labels;

            chartData = {
                labels: dataLabels,
                datasets: [{
                    label: '%',
                    data: dataValues,
                    backgroundColor: colors,
                    borderRadius: 4
                }]
            };

            chartOptions = {
                indexAxis: horizontal ? 'y' : 'x',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                if (horizontal) value = context.parsed.x; // Handle horizontal bar

                                // Remove prefix logic and just return value
                                // label += ': ' + value + '%'; 
                                label = value + '%';
                                if (totalAbsolute) {
                                    const abs = Math.round((value / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: { ticks: { font: { size: 10 }, color: textColor } },
                    y: { ticks: { font: { size: 10 }, color: textColor, autoSkip: false } }
                }
            };
        }

        try {
            chartInstances[canvasId] = new Chart(ctx, {
                type: type,
                data: chartData,
                options: chartOptions
            });
        } catch (err) {
            console.error(`[Eleitorado] Erro ao criar gráfico ${canvasId}:`, err);
        }
    }

    function renderPyramidChart(canvasId, labels, maleValues, femaleValues, totalAbsolute) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (chartInstances[canvasId]) chartInstances[canvasId].destroy();

        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#666';

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Masculino',
                        data: maleValues,
                        backgroundColor: '#3b82f6',
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Feminino',
                        data: femaleValues,
                        backgroundColor: '#ec4899',
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: textColor }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                let value = context.raw;
                                let absPercent = Math.abs(value);

                                label += absPercent.toFixed(1) + '%';

                                if (totalAbsolute) {
                                    const abs = Math.round((absPercent / 100) * totalAbsolute);
                                    label += ` (${abs.toLocaleString('pt-BR')} eleitores)`;
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            color: textColor,
                            callback: function (value) { return Math.abs(value) + '%'; }
                        }
                    },
                    y: {
                        stacked: true,
                        ticks: {
                            color: textColor,
                            autoSkip: false,
                            font: { size: 10 }
                        }
                    }
                }
            }
        });
    }

    // Função para formatar nomes próprios corretamente
    function formatName(name) {
        if (!name) return name;

        // Palavras que devem ficar em minúsculo (conectivos)
        const lowercase = ['de', 'da', 'do', 'das', 'dos', 'e', 'em'];

        return name.split(' ').map((word, index) => {
            const lowerWord = word.toLowerCase();
            if (index > 0 && lowercase.includes(lowerWord)) {
                return lowerWord;
            }
            return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
        }).join(' ');
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (activeCityId) {
            const prev = document.getElementById(activeCityId);
            if (prev) prev.classList.remove('active');
            activeCityId = null;
        }
    }
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);


    // --- 4. Search & Zoom ---
    function initSearch() {
        Object.keys(citiesData).forEach(id => {
            const option = document.createElement('option');
            option.value = citiesData[id].nome;
            datalist.appendChild(option);
        });

        const perform = () => {
            const val = citySearch.value.toLowerCase().trim();
            if (!val) return;
            const id = Object.keys(citiesData).find(key => citiesData[key].nome.toLowerCase() === val);
            if (id) {
                selectCity(id);
                citySearch.blur(); // Remove focus
            } else {
                alert('Cidade não encontrada.');
            }
        };

        // Search on Enter key
        citySearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                perform();
            }
        });

        // Also search when selecting from datalist
        citySearch.addEventListener('change', () => {
            perform();
        });
    }

    function setupZoomPan() {
        const updateTransform = () => {
            if (mapGroup) mapGroup.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
        };

        mapContainer.addEventListener('mousedown', e => {
            isDragging = true;
            startX = e.clientX - pointX;
            startY = e.clientY - pointY;
            mapContainer.style.cursor = 'grabbing';
        });
        window.addEventListener('mouseup', () => { isDragging = false; mapContainer.style.cursor = 'grab'; });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            e.preventDefault();
            pointX = e.clientX - startX;
            pointY = e.clientY - startY;
            updateTransform();
        });
        mapContainer.addEventListener('wheel', e => {
            e.preventDefault();

            // Direção do scroll
            const delta = Math.sign(e.deltaY) * -1;
            const factor = 1.1; // Suave
            let newScale = delta > 0 ? scale * factor : scale / factor;

            // Limites de zoom
            newScale = Math.min(Math.max(0.5, newScale), 10);

            // Posição do mouse relativa ao container
            const rect = mapContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Cálcula novo translate para manter o ponto sob o mouse fixo
            pointX = mouseX - (mouseX - pointX) * (newScale / scale);
            pointY = mouseY - (mouseY - pointY) * (newScale / scale);
            scale = newScale;

            updateTransform();
        });

        zoomInBtn.addEventListener('click', () => { scale *= 1.2; updateTransform(); });
        zoomOutBtn.addEventListener('click', () => { scale /= 1.2; updateTransform(); });
        zoomResetBtn.addEventListener('click', () => { scale = 1; pointX = 0; pointY = 0; updateTransform(); });
    }

    // Theme & Tooltip
    themeToggle.addEventListener('click', () => {
        document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
        themeToggle.innerText = document.body.dataset.theme === 'dark' ? '🌙' : '☀️';
    });

    function showTooltip(txt, e) {
        tooltip.innerText = txt;
        tooltip.classList.remove('hidden');
        moveTooltip(e);
    }
    function hideTooltip() {
        tooltip.classList.add('hidden');
    }
    function moveTooltip(e) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
    }
    // ==========================================
    // 4. AI Chat Logic
    // ==========================================
    function initChat() {
        const chatToggle = document.getElementById('chat-toggle');
        const chatWindow = document.getElementById('chat-window');
        const chatClose = document.getElementById('chat-close');
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatMessages = document.getElementById('chat-messages');

        if (!chatToggle || !chatWindow) return;

        // Toggle Open/Close
        const toggleChat = () => {
            const isOpen = chatWindow.classList.contains('open');
            if (isOpen) {
                chatWindow.classList.remove('open');
            } else {
                chatWindow.classList.add('open');
                // Focus input
                setTimeout(() => chatInput.focus(), 300);
            }
        };

        chatToggle.addEventListener('click', toggleChat);
        chatClose.addEventListener('click', toggleChat);

        // Send Message
        const sendMessage = async () => {
            const text = chatInput.value.trim();
            if (!text) return;

            // 1. Add User Message
            appendMessage(text, 'user');
            chatInput.value = '';
            chatSend.disabled = true;

            // 2. Prepare Context (Current selected city)
            let cityContext = null;
            let mayorContext = null;
            let siteStats = "Dados consolidados não disponíveis.";

            // Calculate Site Stats
            if (citiesData && Object.keys(citiesData).length > 0) {
                const partyCounts = {};
                let totalCidades = 0;

                Object.values(citiesData).forEach(c => {
                    if (c.partido && c.partido !== 'Não informado') {
                        partyCounts[c.partido] = (partyCounts[c.partido] || 0) + 1;
                        totalCidades++;
                    }
                });

                const topParties = Object.entries(partyCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([p, count]) => `${p} (${count})`);

                siteStats = `Total Cidades: ${totalCidades}. Top Partidos: ${topParties.join(', ')}.`;
            }

            if (activeCityId && citiesData[activeCityId]) {
                const city = citiesData[activeCityId];
                cityContext = `${city.nome} (População: ${city.habitantes}, Partido: ${city.partido})`;
                mayorContext = city.prefeito;
            } else {
                cityContext = "Paraná (Estado Geral)";
            }

            // 3. Build Investment Analytics Context
            let investmentContext = null;
            if (typeof investmentsData !== 'undefined' && investmentsData.length > 0) {
                // Global stats
                const totalInvestido = investmentsData.reduce((sum, i) => sum + i.valor, 0);
                const totalInvestimentos = investmentsData.length;
                const cidadesBeneficiadas = new Set(investmentsData.map(i => i.cityId)).size;
                const mediaInvestimento = totalInvestimentos > 0 ? totalInvestido / totalInvestimentos : 0;

                // Por ano
                const byYear = {};
                investmentsData.forEach(inv => {
                    byYear[inv.ano] = (byYear[inv.ano] || 0) + inv.valor;
                });
                const evoluçãoAnual = Object.entries(byYear)
                    .sort((a, b) => a[0] - b[0])
                    .map(([ano, val]) => `${ano}: R$ ${val.toLocaleString('pt-BR')}`);

                // Por área
                const byArea = {};
                investmentsData.forEach(inv => {
                    const area = inv.area || 'Sem área';
                    byArea[area] = (byArea[area] || 0) + inv.valor;
                });
                const porArea = Object.entries(byArea)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([area, val]) => `${area}: R$ ${val.toLocaleString('pt-BR')}`);

                // Por tipo
                const byTipo = {};
                investmentsData.forEach(inv => {
                    const tipo = inv.tipo || 'Sem tipo';
                    byTipo[tipo] = (byTipo[tipo] || 0) + inv.valor;
                });
                const porTipo = Object.entries(byTipo)
                    .sort((a, b) => b[1] - a[1])
                    .map(([tipo, val]) => `${tipo}: R$ ${val.toLocaleString('pt-BR')}`);

                // Top 10 cidades
                const byCity = {};
                investmentsData.forEach(inv => {
                    if (!byCity[inv.cityId]) {
                        byCity[inv.cityId] = { nome: inv.cityName, total: 0, count: 0, areas: [] };
                    }
                    byCity[inv.cityId].total += inv.valor;
                    byCity[inv.cityId].count++;
                    if (!byCity[inv.cityId].areas.includes(inv.area)) {
                        byCity[inv.cityId].areas.push(inv.area);
                    }
                });
                const topCidades = Object.values(byCity)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10)
                    .map(c => `${c.nome}: R$ ${c.total.toLocaleString('pt-BR')} (${c.count} investimentos, áreas: ${c.areas.slice(0, 3).join(', ')})`);

                // Investimentos da cidade selecionada
                let cityInvestments = null;
                if (activeCityId) {
                    const cityInvs = investmentsData.filter(i => i.cityId === activeCityId);
                    if (cityInvs.length > 0) {
                        const cityTotal = cityInvs.reduce((sum, i) => sum + i.valor, 0);
                        cityInvestments = `\nINVESTIMENTOS NESTA CIDADE (${cityInvs[0].cityName}):\n`;
                        cityInvestments += `- Total: R$ ${cityTotal.toLocaleString('pt-BR')} em ${cityInvs.length} investimentos\n`;
                        cityInvestments += `- Detalhes:\n`;
                        cityInvs.sort((a, b) => b.ano - a.ano).forEach(inv => {
                            cityInvestments += `  • ${inv.ano}: R$ ${inv.valor.toLocaleString('pt-BR')} - ${inv.area || 'Sem área'} (${inv.tipo || 'Sem tipo'})${inv.descricao ? ': ' + inv.descricao : ''}\n`;
                        });
                    }
                }

                investmentContext = `
DADOS DE INVESTIMENTOS IMPORTADOS (EMENDAS/PROJETOS):
=====================================
RESUMO GLOBAL:
- Total Investido: R$ ${totalInvestido.toLocaleString('pt-BR')}
- Número de Investimentos: ${totalInvestimentos}
- Cidades Beneficiadas: ${cidadesBeneficiadas}
- Média por Investimento: R$ ${mediaInvestimento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

EVOLUÇÃO ANUAL:
${evoluçãoAnual.join('\n')}

DISTRIBUIÇÃO POR ÁREA (TOP 5):
${porArea.join('\n')}

DISTRIBUIÇÃO POR TIPO:
${porTipo.join('\n')}

TOP 10 CIDADES COM MAIOR INVESTIMENTO:
${topCidades.join('\n')}
${cityInvestments || ''}
`;
            }

            // 4. Show loading bubble
            const loadingId = appendLoading();

            try {
                // Call Backend
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        city_context: cityContext,
                        mayor_context: mayorContext,
                        site_stats: siteStats,
                        investment_context: investmentContext
                    })
                });

                if (!response.ok) throw new Error("Erro na conexão com API");
                const data = await response.json();

                // 4. Remove loading and show response
                removeMessage(loadingId);

                // Format links if sources exist
                let finalResponse = data.response;
                if (data.sources && data.sources.length > 0) {
                    finalResponse += "\n\n**Fontes:**\n" + data.sources.map(s => `- [${s.title}](${s.url})`).join('\n');
                }

                appendMessage(parseMarkdown(finalResponse), 'bot');

            } catch (err) {
                removeMessage(loadingId);
                appendMessage("Desculpe, tive um problema ao conectar com o servidor. Verifique se o backend Python está rodando.", 'bot');
                console.error(err);
            } finally {
                chatSend.disabled = false;
                chatInput.focus();
            }
        };

        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    // Helpers UI
    function appendMessage(text, type) {
        const chatMessages = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = `message ${type}`;

        // Se for bot, aceita HTML (do parseMarkdown), se for user, texto puro para segurança básica
        if (type === 'bot') div.innerHTML = text;
        else div.innerText = text;

        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    function appendLoading() {
        const chatMessages = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'message bot';
        div.id = 'msg-loading-' + Date.now();
        div.innerHTML = '<span style="display:inline-block; animation: pulse 1s infinite">Thinking...</span>';
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div.id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Simple Markdown Parser for Links and Bold
    function parseMarkdown(text) {
        if (!text) return '';
        // Bold
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Links [Label](Url)
        html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        // Line breaks
        html = html.replace(/\n/g, '<br>');
        // List items (simple)
        html = html.replace(/- (.*?)<br>/g, '<li>$1</li>');
        return html;
    }

    // Initialize Chat
    initChat();


    // --- Funções de Campanha: Insights & Tabelas (Admin) ---

    // Atualiza a aba Insights com métricas calculadas
    function updateInsights(slug) {
        if (!isLoggedIn) return;

        const cData = campaignData[slug] || { votes: 0, money: 0 };
        const city = citiesData[slug];
        let eleitorado = 0;

        // Tenta achar dados eleitorais
        let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (eleitoradoData[key]) {
            eleitorado = eleitoradoData[key].total_eleitores;
        }

        const votes = parseFloat(cData.votes) || 0;
        const money = parseFloat(cData.money) || 0;
        const pop = city ? (city.habitantes || 0) : 0;
        let globalVotes = 0;

        // Calcula Global Votes para participação
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        // a. Votos Recebidos
        setStat('ins-votes', Math.round(votes).toLocaleString('pt-BR'));

        // b. Investimento
        setStat('ins-money', money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // c. Votos Convertidos (% do eleitorado da cidade)
        const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
        setStat('ins-conversion', conversion.toFixed(2) + '%');

        // d. Investimento por Voto Convertido (R$/voto)
        const costVote = votes > 0 ? (money / votes) : 0;
        setStat('ins-cost-vote', costVote.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // e. Investimento por População (R$/pop)
        const costPop = pop > 0 ? (money / pop) : 0;
        setStat('ins-cost-pop', costPop.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

        // f. Participação Global (% votos da cidade / votos totais da campanha)
        const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;
        setStat('ins-share', share.toFixed(2) + '%');
    }

    function setStat(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }

    // --- Tabela Resumo ---
    function openSummaryModal() {
        const modal = document.getElementById('summary-modal');
        const tbody = document.querySelector('#summary-table tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        let globalVotes = 0;
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        const citiesList = Object.keys(citiesData)
            .filter(slug => {
                const name = citiesData[slug].nome || "";
                // Remove linhas de metadados/lixo (Notas, Fontes, etc)
                if (name.includes('Nota') || name.includes('Fonte') || name.length > 50) return false;
                if (name.startsWith('Escolariza') || name.startsWith('Popula') || name.startsWith('Área') || name.startsWith('Densidade')) return false;
                return true;
            })
            .map(slug => {
                const city = citiesData[slug];
                const cData = campaignData[slug] || { votes: 0, money: 0 };

                let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const eleitorado = eleitoradoData[key] ? eleitoradoData[key].total_eleitores : 0;

                const votes = cData.votes || 0;
                const money = cData.money || 0;
                const pop = city.habitantes || 0;

                const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
                const costVote = votes > 0 ? (money / votes) : 0;
                const costPop = pop > 0 ? (money / pop) : 0;
                const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;

                return {
                    name: city.nome,
                    votes, money, conversion, costVote, costPop, share
                };
            });

        // Ordenar por Votos (Decrescente)
        citiesList.sort((a, b) => b.votes - a.votes);

        // Função de renderização interna
        const renderTable = (items) => {
            tbody.innerHTML = '';
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:1rem; color:var(--text-secondary);">Nenhuma cidade encontrada.</td></tr>';
                return;
            }
            items.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${c.name}</td>
                    <td>${c.votes.toLocaleString('pt-BR')}</td>
                    <td>${c.money.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.conversion.toFixed(2)}%</td>
                    <td>${c.costVote.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.costPop.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td>${c.share.toFixed(2)}%</td>
                `;
                tbody.appendChild(tr);
            });
        };

        // Renderização inicial
        renderTable(citiesList);

        // Configurar busca (remove listener antigo clonando input ou apenas sobrescrevendo oninput)
        const searchInput = document.getElementById('summary-search');
        if (searchInput) {
            searchInput.value = ''; // Reset
            searchInput.oninput = (e) => {
                const term = e.target.value.toLowerCase();
                const filtered = citiesList.filter(c => c.name.toLowerCase().includes(term));
                renderTable(filtered);
            };
        }

        modal.classList.remove('hidden');
    }

    async function exportSummaryToExcel() {
        console.log("Iniciando exportação...");
        // 1. Recalcular Dados (Fonte da Verdade Limpa)
        let globalVotes = 0;
        Object.values(campaignData).forEach(d => globalVotes += (d.votes || 0));

        const data = Object.keys(citiesData)
            .filter(slug => {
                const name = citiesData[slug].nome || "";
                if (name.includes('Nota') || name.includes('Fonte') || name.length > 50) return false;
                if (name.startsWith('Escolariza') || name.startsWith('Popula') || name.startsWith('Área') || name.startsWith('Densidade')) return false;
                return true;
            })
            .map(slug => {
                const city = citiesData[slug];
                const cData = campaignData[slug] || { votes: 0, money: 0 };
                let key = slug.toLowerCase().trim().replace(/-/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const eleitorado = eleitoradoData[key] ? eleitoradoData[key].total_eleitores : 0;
                const votes = cData.votes || 0;
                const money = cData.money || 0;
                const pop = parseInt(city.habitantes.toString().replace(/\./g, '')) || 0;

                const conversion = eleitorado > 0 ? (votes / eleitorado) * 100 : 0;
                const costVote = votes > 0 ? (money / votes) : 0;
                const costPop = pop > 0 ? (money / pop) : 0;
                const share = globalVotes > 0 ? (votes / globalVotes) * 100 : 0;

                return {
                    "Cidade": city.nome,
                    "Votos": votes,
                    "Investimento (R$)": money,
                    "Conversão (%)": parseFloat(conversion.toFixed(2)),
                    "R$/Voto": parseFloat(costVote.toFixed(2)),
                    "R$/Pop": parseFloat(costPop.toFixed(2)),
                    "Participação (%)": parseFloat(share.toFixed(2))
                };
            });

        // Ordenar por Votos
        data.sort((a, b) => b["Votos"] - a["Votos"]);

        if (data.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        // 2. Mapear para Modelo da API (Backend Python)
        const apiItems = data.map(item => ({
            city: item["Cidade"],
            votes: item["Votos"],
            investment: item["Investimento (R$)"],
            conversion: item["Conversão (%)"],
            cost_per_vote: item["R$/Voto"],
            cost_per_pop: item["R$/Pop"],
            share: item["Participação (%)"]
        }));

        try {
            alert("Solicitando arquivo ao servidor... Aguarde.");

            const res = await fetch('http://localhost:8082/api/export_excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: apiItems })
            });

            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || "Falha na geração do arquivo.");
            }

            const data = await res.json();

            if (data.download_url) {
                // Adiciona timestamp para evitar cache do navegador (crucial para o Chrome)
                const downloadLink = `http://localhost:8082${data.download_url}?t=${Date.now()}`;

                console.log("Tentando download via link:", downloadLink);

                // Método 1: Criação de Link (Padrão)
                const a = document.createElement('a');
                a.href = downloadLink;
                a.setAttribute('download', 'Resumo_Campanha_Parana.xlsx');
                a.target = '_blank'; // Força nova aba para garantir que o Chrome não bloqueie
                document.body.appendChild(a);
                a.click();

                // Cleanup
                setTimeout(() => {
                    document.body.removeChild(a);
                }, 500);

            } else {
                throw new Error("URL de download não retornada pelo servidor.");
            }

            console.log("Download via Backend concluído.");

        } catch (error) {
            console.error("Erro na exportação via servidor:", error);
            alert("Erro ao exportar arquivo: " + error.message);
        }
    }

    // --- Importação Excel ---
    function triggerImport() {
        // Abre o modal de instruções primeiro
        document.getElementById('import-modal').classList.remove('hidden');
    }

    async function handleExcelImport(e) {
        console.log("handleExcelImport triggered");
        const file = e.target.files[0];
        if (!file) {
            console.log("No file selected");
            return;
        }
        console.log("File selected:", file.name);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            console.log("FileReader loaded data");
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                // Converte para Matriz de Dados (Array de Arrays)
                // Isso é mais seguro que JSON com chaves, pois evita problemas com espaços em cabeçalhos
                const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                if (rawData.length < 2) {
                    alert("Arquivo vazio ou sem dados (apenas cabeçalho).");
                    return;
                }

                // 1. Identificar índices das colunas (ignorando case e espaços)
                const headerRow = rawData[0].map(h => h ? h.toString().trim() : "");
                const cleanHeaders = headerRow.filter(h => h !== "");

                // Validação 1 & 2: Colunas Corretas e Únicas
                // NOVO: Esperado: CIDADE, ANO, VOTOS

                // Normaliza para verificar presença
                const lowerHeaders = headerRow.map(h => h.toLowerCase());
                const idxCidade = lowerHeaders.indexOf('cidade');
                const idxAno = lowerHeaders.indexOf('ano');
                const idxVotos = lowerHeaders.indexOf('votos');

                // Verificação de nomes (existência)
                if (idxCidade === -1 || idxAno === -1 || idxVotos === -1) {
                    alert("A tabela não foi importada, por conta de não atender as especificações.\n\nMotivo: As colunas obrigatórias não foram encontradas.\nEsperado: CIDADE, ANO, VOTOS.");
                    return;
                }

                // Verificação de Quantidade (Não pode ter colunas extras)
                if (cleanHeaders.length !== 3) {
                    alert(`A tabela não foi importada, por conta de não atender as especificações.\n\nMotivo: A tabela deve conter APENAS as 3 colunas solicitadas.\nEncontradas: ${cleanHeaders.length} colunas.`);
                    return;
                }

                // 2. Processar Linhas e Validar Cidades
                const bulkItems = [];
                const nameToSlug = {};

                // Cache de slugs normalizados
                Object.keys(citiesData).forEach(slug => {
                    const cleanName = citiesData[slug].nome.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    nameToSlug[cleanName] = slug;
                });

                let errors = [];

                for (let i = 1; i < rawData.length; i++) {
                    const row = rawData[i];
                    if (!row || row.length === 0) continue;

                    let cityName = row[idxCidade];
                    const hasData = row.some(cell => cell !== undefined && cell !== null && cell !== "");
                    if (!hasData) continue;

                    if (!cityName) {
                        errors.push(`Linha ${i + 1}: Nome da cidade vazio.`);
                        continue;
                    }

                    // Normalização
                    const clean = cityName.toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const slug = nameToSlug[clean];

                    if (!slug) {
                        // Validação 3: Apenas cidades existentes
                        errors.push(`Linha ${i + 1}: Cidade "${cityName}" não pertence ao cadastro do Paraná.`);
                        continue;
                    }

                    // NOVO: Pega ANO e VOTOS
                    const ano = parseInt(row[idxAno]) || 0;
                    const votos = parseInt(row[idxVotos]) || 0;

                    // Valida ano
                    if (ano < 1900 || ano > 2100) {
                        errors.push(`Linha ${i + 1}: Ano inválido "${row[idxAno]}".`);
                        continue;
                    }

                    bulkItems.push({
                        city_slug: slug,
                        ano: ano,
                        votos: votos
                    });
                }

                if (errors.length > 0) {
                    alert(`A tabela não foi importada, por conta de não atender as especificações.\n\nErros encontrados:\n${errors.slice(0, 5).join('\n')}\n${errors.length > 5 ? '...e mais ' + (errors.length - 5) + ' erros.' : ''}`);
                    return;
                }

                if (bulkItems.length > 0) {
                    // NOVO: Armazenar votos por cidade/ano localmente
                    // Limpa dados antigos e reprocessa
                    votosData = {};

                    bulkItems.forEach(item => {
                        if (!votosData[item.city_slug]) {
                            votosData[item.city_slug] = [];
                        }
                        // Verifica se já existe entrada para esse ano
                        const existingIndex = votosData[item.city_slug].findIndex(v => v.ano === item.ano);
                        if (existingIndex >= 0) {
                            // Soma votos se mesmo ano
                            votosData[item.city_slug][existingIndex].votos += item.votos;
                        } else {
                            votosData[item.city_slug].push({
                                ano: item.ano,
                                votos: item.votos
                            });
                        }
                    });

                    // Ordena cada cidade por ano
                    Object.keys(votosData).forEach(slug => {
                        votosData[slug].sort((a, b) => a.ano - b.ano);
                    });

                    // Atualiza campaignData com total de votos (soma de todos os anos)
                    Object.keys(votosData).forEach(slug => {
                        const totalVotos = votosData[slug].reduce((sum, v) => sum + v.votos, 0);
                        if (!campaignData[slug]) {
                            campaignData[slug] = { votes: 0, money: 0 };
                        }
                        campaignData[slug].votes = totalVotos;
                    });

                    // Também envia pro backend (formato adaptado para manter compatibilidade)
                    const backendItems = Object.keys(votosData).map(slug => ({
                        city_slug: slug,
                        votes: campaignData[slug].votes,
                        money: campaignData[slug].money || 0
                    }));

                    const res = await fetch('http://localhost:8082/api/campaign/update_bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ items: backendItems })
                    });

                    // Também salva votosData no backend
                    await fetch('/api/votos/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ votos: votosData })
                    }).catch(e => console.log('Backend votos save optional'));

                    if (res.ok) {
                        const totalCities = Object.keys(votosData).length;
                        const totalEntries = bulkItems.length;
                        alert(`Sucesso! ${totalEntries} registros importados para ${totalCities} cidades.`);

                        // Recarrega dados globais
                        loadCampaignGlobalStats();

                        // Se tiver cidade aberta, atualiza sidebar incluindo aba de votos
                        if (activeCityId) {
                            populateSidebar(activeCityId);
                            updateVotosTab(activeCityId);
                        }
                        updateMapDisplay();

                        // Fecha modal de importação
                        document.getElementById('import-modal').classList.add('hidden');

                    } else {
                        const errText = await res.text();
                        console.error("Erro Servidor:", errText);
                        alert(`Erro ao salvar dados no servidor (Status ${res.status}):\n${errText}`);
                    }
                } else {
                    alert("Nenhum dado válido encontrado para importação.");
                }

            } catch (err) {
                console.error("Erro crítico no processamento:", err);
                alert(`Ocorreu um erro ao processar o arquivo Excel:\n\n${err.message || err.toString()}`);
            }
        };
        reader.readAsArrayBuffer(file);
        // Limpa input

    }

    // Inicializa novos listeners
    function initAdminListeners() {
        // Botão Tabela
        const btnSummary = document.getElementById('btn-summary');
        if (btnSummary) btnSummary.addEventListener('click', openSummaryModal);

        // Modal Close (Summary)
        const closeSum = document.getElementById('close-summary');
        if (closeSum) closeSum.addEventListener('click', () => {
            document.getElementById('summary-modal').classList.add('hidden');
        });

        // Export
        const btnExp = document.getElementById('btn-export-excel');
        if (btnExp) btnExp.addEventListener('click', exportSummaryToExcel);

        // Import Button (Barra) -> Abre Modal Instruções
        const btnImp = document.getElementById('btn-import');
        if (btnImp) btnImp.addEventListener('click', triggerImport);

        // --- Import Modal Listeners ---
        // X fecha modal e cancela
        const closeImp = document.getElementById('close-import');
        if (closeImp) closeImp.addEventListener('click', () => {
            document.getElementById('import-modal').classList.add('hidden');
        });

        // ENTENDI / SELECIONAR -> Clica no input file
        const btnConfirmImp = document.getElementById('btn-confirm-import');
        if (btnConfirmImp) btnConfirmImp.addEventListener('click', (e) => {
            e.preventDefault(); // Evita comportamentos padrão
            const fileInput = document.getElementById('file-import');
            if (fileInput) {
                // Reseta o valor para permitir selecionar o mesmo arquivo novamente (caso tenha dado erro antes)
                fileInput.value = "";
                // Força o clique no input
                fileInput.click();
            } else {
                alert("Erro: Campo de arquivo não encontrado.");
            }
            // Fecha modal apenas depois (opcional, manter ou não, mas o timeout pode ajudar)
            document.getElementById('import-modal').classList.add('hidden');
        });

        // Ocorre quando arquivo é selecionado
        const fileImp = document.getElementById('file-import');
        if (fileImp) fileImp.addEventListener('change', handleExcelImport);
    }

    // Auto-init listeners immediately (DOM is ready)
    initAdminListeners();

    // ============================================
    // INVESTMENT MANAGEMENT SYSTEM
    // ============================================

    let investmentsData = []; // Array of all investment records
    let globalChartEvolucao = null;
    let globalChartArea = null;
    let globalChartTipo = null;
    let cityChartInv = null;

    // Load investments from server on startup
    async function loadInvestmentsFromServer() {
        try {
            const response = await fetch('/api/investments/data');
            if (response.ok) {
                const data = await response.json();
                if (data.investments && data.investments.length > 0) {
                    investmentsData = data.investments;
                    console.log(`Investimentos carregados: ${investmentsData.length}`);
                    populateInvestmentFilters();
                }
            }
        } catch (error) {
            console.log('Servidor não disponível para carregar investimentos');
        }
    }

    // Save investments to server
    async function saveInvestmentsToServer() {
        try {
            const response = await fetch('/api/investments/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ investments: investmentsData })
            });
            if (response.ok) {
                const data = await response.json();
                console.log(`Investimentos salvos no servidor: ${data.count}`);
                return true;
            }
        } catch (error) {
            console.error('Erro ao salvar investimentos no servidor:', error);
        }
        return false;
    }

    // Load investments on init
    loadInvestmentsFromServer();

    // Initialize investment import button
    function initInvestmentImport() {
        const btnImportInv = document.getElementById('btn-import-investments');
        const fileInputInv = document.getElementById('file-import-investments');
        const modalInv = document.getElementById('import-investments-modal');
        const closeInv = document.getElementById('close-import-investments');
        const confirmInv = document.getElementById('btn-confirm-import-investments');

        if (btnImportInv) {
            btnImportInv.addEventListener('click', () => {
                if (modalInv) modalInv.classList.remove('hidden');
            });
        }

        if (closeInv) {
            closeInv.addEventListener('click', () => {
                modalInv.classList.add('hidden');
            });
        }

        if (confirmInv) {
            confirmInv.addEventListener('click', () => {
                if (fileInputInv) {
                    fileInputInv.value = "";
                    fileInputInv.click();
                }
                modalInv.classList.add('hidden');
            });
        }

        if (fileInputInv) {
            fileInputInv.addEventListener('change', handleInvestmentExcelImport);
        }
    }

    // Handle investment Excel import
    async function handleInvestmentExcelImport(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

            if (rows.length === 0) {
                alert('❌ ERRO: Planilha vazia!\n\nNenhum dado encontrado na planilha.');
                return;
            }

            // Check required columns in first row
            const firstRow = rows[0];
            const columnKeys = Object.keys(firstRow);

            // Helper to find column (case insensitive, accent insensitive)
            const normalizeStr = (s) => s.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const findColumn = (names) => {
                for (const name of names) {
                    const found = columnKeys.find(k => normalizeStr(k).includes(normalizeStr(name)));
                    if (found) return found;
                }
                return null;
            };

            // Map columns
            const colCidade = findColumn(['cidade']);
            const colAno = findColumn(['ano']);
            const colValor = findColumn(['valor']);
            const colArea = findColumn(['area', 'área']);
            const colTipo = findColumn(['tipo']);
            const colDesc = findColumn(['descri', 'descrição', 'descricao']);

            // Validate required columns
            const missingCols = [];
            if (!colCidade) missingCols.push('CIDADE');
            if (!colAno) missingCols.push('ANO');
            if (!colValor) missingCols.push('VALOR INDICADO');

            if (missingCols.length > 0) {
                alert(`❌ ERRO: Colunas obrigatórias não encontradas!\n\nColunas faltando: ${missingCols.join(', ')}\n\nColunas encontradas na planilha:\n${columnKeys.join(', ')}\n\nVerifique se a primeira linha da planilha contém os cabeçalhos corretos.`);
                return;
            }

            // Parse Brazilian number format (1.000,00 -> 1000.00)
            const parseBrazilianNumber = (val) => {
                if (typeof val === 'number') return val;
                if (!val) return 0;
                let str = val.toString().trim();
                // Remove thousand separators (.)
                str = str.replace(/\./g, '');
                // Replace decimal comma with dot
                str = str.replace(',', '.');
                return parseFloat(str) || 0;
            };

            // Clear existing data (overwrite mode)
            const newInvestments = [];

            // Parse investments
            let imported = 0;
            let notFound = [];
            let invalidRows = [];
            let rowNum = 1; // Start from 1 (header is 0)

            rows.forEach(row => {
                rowNum++;

                const cityName = (row[colCidade] || '').toString().trim();
                const anoRaw = row[colAno];
                const valorRaw = row[colValor];
                const area = colArea ? (row[colArea] || '').toString().trim() : '';
                const tipo = colTipo ? (row[colTipo] || '').toString().trim() : '';
                const descricao = colDesc ? (row[colDesc] || '').toString().trim() : '';

                // Skip empty rows
                if (!cityName && !anoRaw && !valorRaw) return;

                // Validate row
                const ano = parseInt(anoRaw) || 0;
                const valor = parseBrazilianNumber(valorRaw);

                if (!cityName) {
                    invalidRows.push(`Linha ${rowNum}: Nome da cidade vazio`);
                    return;
                }
                if (!ano || ano < 1900 || ano > 2100) {
                    invalidRows.push(`Linha ${rowNum} (${cityName}): Ano inválido "${anoRaw}"`);
                    return;
                }
                if (!valor || valor <= 0) {
                    invalidRows.push(`Linha ${rowNum} (${cityName}): Valor inválido "${valorRaw}"`);
                    return;
                }

                // Find city by name (case insensitive, accent tolerant)
                const cityId = Object.keys(citiesData).find(id => {
                    const nomeCidade = citiesData[id].nome || '';
                    return normalizeStr(nomeCidade) === normalizeStr(cityName);
                });

                if (cityId) {
                    newInvestments.push({
                        cityId,
                        cityName: citiesData[cityId].nome,
                        ano,
                        valor,
                        area,
                        tipo,
                        descricao
                    });
                    imported++;
                } else {
                    if (!notFound.includes(cityName)) notFound.push(cityName);
                }
            });

            // Build result message
            let message = '';

            if (imported > 0) {
                message += `✅ SUCESSO!\n\n${imported} investimentos importados com sucesso.\n`;
                message += `(Os dados anteriores foram sobrescritos)\n`;
            } else {
                message += `⚠️ ATENÇÃO!\n\nNenhum investimento foi importado.\n`;
            }

            if (notFound.length > 0) {
                message += `\n📍 Cidades não encontradas (${notFound.length}):\n${notFound.slice(0, 10).join(', ')}${notFound.length > 10 ? '...' : ''}\n`;
            }

            if (invalidRows.length > 0) {
                message += `\n❌ Linhas com erro (${invalidRows.length}):\n${invalidRows.slice(0, 5).join('\n')}${invalidRows.length > 5 ? '\n...' : ''}\n`;
            }

            // Replace existing data with new data (overwrite)
            if (imported > 0) {
                investmentsData = newInvestments;
                window.investmentsData = newInvestments; // Atualiza global para filtros

                // Atualiza campaignData.money com totais de investimentos
                // Primeiro limpa apenas os valores de money (não afeta votes)
                Object.keys(campaignData).forEach(slug => {
                    campaignData[slug].money = 0;
                });

                // Recalcula totais de investimentos por cidade
                newInvestments.forEach(inv => {
                    const slug = inv.cityId;
                    if (!campaignData[slug]) {
                        campaignData[slug] = { votes: 0, money: 0 };
                    }
                    campaignData[slug].money += inv.valor || 0;
                });

                // Save to server
                const saved = await saveInvestmentsToServer();
                if (saved) {
                    message += `\n💾 Dados salvos no servidor com sucesso!`;
                } else {
                    message += `\n⚠️ Não foi possível salvar no servidor (dados mantidos localmente)`;
                }

                // Populate filters with unique values
                populateInvestmentFilters();

                // Atualiza mapa se estiver em visualização de investimentos
                updateMapDisplay();

                // Update current city view if open
                if (activeCityId) {
                    updateCityInvestments(activeCityId);
                }
            }

            alert(message);

        } catch (error) {
            console.error('Erro ao importar investimentos:', error);
            alert(`❌ ERRO AO LER ARQUIVO!\n\n${error.message}\n\nVerifique se o arquivo é um Excel válido (.xlsx ou .xls).`);
        }
    }

    // Populate filter dropdowns with unique values
    function populateInvestmentFilters() {
        const anos = [...new Set(investmentsData.map(i => i.ano))].sort((a, b) => b - a);
        const areas = [...new Set(investmentsData.map(i => i.area).filter(a => a))].sort();
        const tipos = [...new Set(investmentsData.map(i => i.tipo).filter(t => t))].sort();

        // Global filters
        populateSelect('filter-global-ano', anos, 'Todos os Anos');
        populateSelect('filter-global-area', areas, 'Todas as Áreas');
        populateSelect('filter-global-tipo', tipos, 'Todos os Tipos');

        // City filters
        populateSelect('filter-inv-ano-cidade', anos, 'Todos os Anos');
        populateSelect('filter-inv-area-cidade', areas, 'Todas as Áreas');
        populateSelect('filter-inv-tipo-cidade', tipos, 'Todos os Tipos');
    }

    function populateSelect(selectId, options, defaultText) {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.innerHTML = `<option value="all">${defaultText}</option>`;
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
    }

    // Update city investments tab
    function updateCityInvestments(cityId) {
        const cityInvestments = investmentsData.filter(i => i.cityId === cityId);

        // Get filter values
        const filterAno = document.getElementById('filter-inv-ano-cidade')?.value || 'all';
        const filterArea = document.getElementById('filter-inv-area-cidade')?.value || 'all';
        const filterTipo = document.getElementById('filter-inv-tipo-cidade')?.value || 'all';

        // Apply filters
        let filtered = cityInvestments;
        if (filterAno !== 'all') filtered = filtered.filter(i => i.ano == filterAno);
        if (filterArea !== 'all') filtered = filtered.filter(i => i.area === filterArea);
        if (filterTipo !== 'all') filtered = filtered.filter(i => i.tipo === filterTipo);

        // Update totals
        const total = filtered.reduce((sum, i) => sum + i.valor, 0);
        const count = filtered.length;

        document.getElementById('inv-total-cidade').textContent = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('inv-count-cidade').textContent = count;

        // Update list
        const listContainer = document.getElementById('inv-list-cidade');
        if (listContainer) {
            if (filtered.length === 0) {
                listContainer.innerHTML = '<p class="no-data">Nenhum investimento registrado para esta cidade.</p>';
            } else {
                listContainer.innerHTML = filtered.sort((a, b) => b.ano - a.ano).map(inv => `
                    <div class="inv-item">
                        <div class="inv-item-header">
                            <span class="inv-item-year">${inv.ano}</span>
                            <span class="inv-item-value">R$ ${inv.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div class="inv-item-area">${inv.area || 'Sem área'}</div>
                        <div class="inv-item-tipo">${inv.tipo || 'Sem tipo'}</div>
                        ${inv.descricao ? `<div class="inv-item-desc">${inv.descricao}</div>` : ''}
                    </div>
                `).join('');
            }
        }

        // Update chart
        updateCityInvestmentChart(filtered);
    }

    // City investment chart
    function updateCityInvestmentChart(investments) {
        const canvas = document.getElementById('chart-inv-cidade');
        if (!canvas) return;

        // Group by year
        const byYear = {};
        investments.forEach(inv => {
            byYear[inv.ano] = (byYear[inv.ano] || 0) + inv.valor;
        });

        const years = Object.keys(byYear).sort();
        const values = years.map(y => byYear[y]);

        if (cityChartInv) cityChartInv.destroy();

        cityChartInv = new Chart(canvas, {
            type: 'line',
            data: {
                labels: years,
                datasets: [{
                    label: 'Investimento (R$)',
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: v => 'R$ ' + v.toLocaleString('pt-BR')
                        }
                    }
                }
            }
        });
    }

    // Initialize Analytics Modal
    function initAnalyticsModal() {
        const btnAnalytics = document.getElementById('btn-analytics');
        const modal = document.getElementById('analytics-modal');
        const closeBtn = document.getElementById('close-analytics');
        const applyBtn = document.getElementById('btn-apply-filters');

        if (btnAnalytics) {
            btnAnalytics.addEventListener('click', () => {
                modal.classList.remove('hidden');
                updateAnalyticsDashboard();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                updateAnalyticsDashboard();
            });
        }

        // Close on outside click
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('hidden');
            });
        }
    }

    // Update Analytics Dashboard
    function updateAnalyticsDashboard() {
        const filterAno = document.getElementById('filter-global-ano')?.value || 'all';
        const filterArea = document.getElementById('filter-global-area')?.value || 'all';
        const filterTipo = document.getElementById('filter-global-tipo')?.value || 'all';

        // Apply filters
        let filtered = investmentsData;
        if (filterAno !== 'all') filtered = filtered.filter(i => i.ano == filterAno);
        if (filterArea !== 'all') filtered = filtered.filter(i => i.area === filterArea);
        if (filterTipo !== 'all') filtered = filtered.filter(i => i.tipo === filterTipo);

        // Update KPIs
        const total = filtered.reduce((sum, i) => sum + i.valor, 0);
        const count = filtered.length;
        const cities = new Set(filtered.map(i => i.cityId)).size;
        const avg = count > 0 ? total / count : 0;

        document.getElementById('kpi-total').textContent = `R$ ${total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        document.getElementById('kpi-count').textContent = count;
        document.getElementById('kpi-cities').textContent = cities;
        document.getElementById('kpi-avg').textContent = `R$ ${avg.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

        // Update charts
        updateGlobalCharts(filtered);

        // Update top cities table
        updateTopCitiesTable(filtered);
    }

    // Update global charts
    function updateGlobalCharts(investments) {
        // Evolution chart
        const byYear = {};
        investments.forEach(inv => {
            byYear[inv.ano] = (byYear[inv.ano] || 0) + inv.valor;
        });
        const years = Object.keys(byYear).sort();
        const yearValues = years.map(y => byYear[y]);

        const canvasEvo = document.getElementById('chart-global-evolucao');
        if (canvasEvo) {
            if (globalChartEvolucao) globalChartEvolucao.destroy();
            globalChartEvolucao = new Chart(canvasEvo, {
                type: 'line',
                data: {
                    labels: years,
                    datasets: [{
                        label: 'Investimento Total (R$)',
                        data: yearValues,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.15)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: 5,
                        pointBackgroundColor: '#2563eb'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k'
                            }
                        }
                    }
                }
            });
        }

        // Area distribution chart
        const byArea = {};
        investments.forEach(inv => {
            const area = inv.area || 'Sem área';
            byArea[area] = (byArea[area] || 0) + inv.valor;
        });
        const areas = Object.keys(byArea);
        const areaValues = areas.map(a => byArea[a]);
        const areaColors = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626', '#64748b'];

        const canvasArea = document.getElementById('chart-global-area');
        if (canvasArea) {
            if (globalChartArea) globalChartArea.destroy();
            globalChartArea = new Chart(canvasArea, {
                type: 'doughnut',
                data: {
                    labels: areas,
                    datasets: [{
                        data: areaValues,
                        backgroundColor: areaColors.slice(0, areas.length)
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { font: { size: 11 } }
                        }
                    }
                }
            });
        }

        // Type distribution chart
        const byTipo = {};
        investments.forEach(inv => {
            const tipo = inv.tipo || 'Sem tipo';
            byTipo[tipo] = (byTipo[tipo] || 0) + inv.valor;
        });
        const tipos = Object.keys(byTipo);
        const tipoValues = tipos.map(t => byTipo[t]);

        const canvasTipo = document.getElementById('chart-global-tipo');
        if (canvasTipo) {
            if (globalChartTipo) globalChartTipo.destroy();
            globalChartTipo = new Chart(canvasTipo, {
                type: 'bar',
                data: {
                    labels: tipos,
                    datasets: [{
                        label: 'Total (R$)',
                        data: tipoValues,
                        backgroundColor: '#7c3aed'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: v => 'R$ ' + (v / 1000).toFixed(0) + 'k'
                            }
                        }
                    }
                }
            });
        }
    }

    // Update top cities table
    function updateTopCitiesTable(investments) {
        const byCity = {};
        investments.forEach(inv => {
            if (!byCity[inv.cityId]) {
                byCity[inv.cityId] = { name: inv.cityName, total: 0, count: 0, areas: {} };
            }
            byCity[inv.cityId].total += inv.valor;
            byCity[inv.cityId].count++;
            byCity[inv.cityId].areas[inv.area || 'Sem área'] = true;
        });

        const sorted = Object.values(byCity).sort((a, b) => b.total - a.total).slice(0, 10);

        const tbody = document.querySelector('#table-top-cities tbody');
        if (tbody) {
            if (sorted.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Nenhum dado disponível</td></tr>';
            } else {
                tbody.innerHTML = sorted.map(city => `
                    <tr>
                        <td><strong>${city.name}</strong></td>
                        <td>R$ ${city.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>${city.count}</td>
                        <td>${Object.keys(city.areas).slice(0, 3).join(', ')}</td>
                    </tr>
                `).join('');
            }
        }
    }

    // Add filter listeners for city investments
    function initCityInvestmentFilters() {
        ['filter-inv-ano-cidade', 'filter-inv-area-cidade', 'filter-inv-tipo-cidade'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    if (activeCityId) updateCityInvestments(activeCityId);
                });
            }
        });
    }

    // Modified selectCity to also update investments, votos and insights
    const originalSelectCity = selectCity;
    selectCity = function (id) {
        originalSelectCity(id);
        updateCityInvestments(id);
        updateVotosTab(id);
        updateInsightsTab(id);
    };

    // Initialize investment system
    initInvestmentImport();
    initAnalyticsModal();
    initCityInvestmentFilters();

    // ============================================
    // SIDEBAR RESIZABLE FUNCTIONALITY
    // ============================================

    function initSidebarResize() {
        const sidebar = document.getElementById('sidebar');
        const resizeHandle = document.getElementById('sidebar-resize-handle');

        if (!sidebar || !resizeHandle) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        const minWidth = 300;
        const maxWidth = 600;

        // Mouse down on handle - start resizing
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;

            sidebar.classList.add('resizing');
            resizeHandle.classList.add('active');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
        });

        // Mouse move - resize if active
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            // Calculate new width (inverted because handle is on left side)
            const deltaX = startX - e.clientX;
            let newWidth = startWidth + deltaX;

            // Clamp to min/max
            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

            sidebar.style.width = newWidth + 'px';
        });

        // Mouse up - stop resizing
        document.addEventListener('mouseup', () => {
            if (!isResizing) return;

            isResizing = false;
            sidebar.classList.remove('resizing');
            resizeHandle.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        });

        // Touch support for mobile
        resizeHandle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            isResizing = true;
            startX = e.touches[0].clientX;
            startWidth = sidebar.offsetWidth;

            sidebar.classList.add('resizing');
            resizeHandle.classList.add('active');
        });

        document.addEventListener('touchmove', (e) => {
            if (!isResizing) return;

            const deltaX = startX - e.touches[0].clientX;
            let newWidth = startWidth + deltaX;

            newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
            sidebar.style.width = newWidth + 'px';
        });

        document.addEventListener('touchend', () => {
            if (!isResizing) return;

            isResizing = false;
            sidebar.classList.remove('resizing');
            resizeHandle.classList.remove('active');
        });

        console.log('Sidebar resize initialized');
    }

    // Initialize sidebar resize
    initSidebarResize();

    // ============================================
    // VOTOS TAB MANAGEMENT
    // ============================================

    // Carrega votos do servidor e atualiza campaignData
    async function loadVotosFromServer() {
        try {
            const response = await fetch('/api/votos/data');
            if (response.ok) {
                const data = await response.json();
                if (data.votos && Object.keys(data.votos).length > 0) {
                    votosData = data.votos;
                    console.log(`Votos carregados: ${Object.keys(votosData).length} cidades`);

                    // Atualiza campaignData.votes com totais de votos
                    Object.keys(votosData).forEach(slug => {
                        const totalVotos = votosData[slug].reduce((sum, v) => sum + v.votos, 0);
                        if (!campaignData[slug]) {
                            campaignData[slug] = { votes: 0, money: 0 };
                        }
                        campaignData[slug].votes = totalVotos;
                    });
                }
            }
        } catch (error) {
            console.log('Servidor não disponível para carregar votos');
        }
    }

    // Inicializa carregamento de votos
    loadVotosFromServer();

    // Atualiza a aba Votos Recebidos para uma cidade
    function updateVotosTab(cityId) {
        const slug = cityId;
        const cityVotos = votosData[slug] || [];

        // Atualiza gráfico de evolução
        updateVotosEvolucaoChart(cityVotos);

        // Atualiza tabela de crescimento
        updateVotosCrescimentoTable(cityVotos);
    }

    // Gráfico de Evolução Anual de Votos
    function updateVotosEvolucaoChart(cityVotos) {
        const ctx = document.getElementById('chart-votos-evolucao');
        if (!ctx) return;

        // Destroi gráfico anterior
        if (chartVotosEvolucao) {
            chartVotosEvolucao.destroy();
            chartVotosEvolucao = null;
        }

        if (cityVotos.length === 0) {
            return;
        }

        const labels = cityVotos.map(v => v.ano.toString());
        const data = cityVotos.map(v => v.votos);

        chartVotosEvolucao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Votos',
                    data: data,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 2,
                    borderRadius: 8,
                    barPercentage: 0.6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: '#fff',
                        bodyColor: '#fff',
                        borderColor: 'rgba(37, 99, 235, 0.5)',
                        borderWidth: 1,
                        displayColors: false,
                        callbacks: {
                            label: function (context) {
                                return context.raw.toLocaleString('pt-BR') + ' votos';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            callback: function (value) {
                                if (value >= 1000) {
                                    return (value / 1000).toFixed(0) + 'k';
                                }
                                return value;
                            }
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    // Tabela de Crescimento/Variação Anual (substituiu o gráfico de rosca)
    function updateVotosCrescimentoTable(cityVotos) {
        const table = document.getElementById('table-votos-crescimento');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        if (cityVotos.length < 2) {
            // Não há dados suficientes para mostrar crescimento
            tbody.innerHTML = '<tr><td colspan="4" class="no-data">Sem dados de comparação disponíveis.</td></tr>';
            return;
        }

        // Calcula variação entre anos e popula tabela
        let rows = '';

        for (let i = 1; i < cityVotos.length; i++) {
            const anoAnterior = cityVotos[i - 1];
            const anoAtual = cityVotos[i];
            const periodo = `${anoAnterior.ano} → ${anoAtual.ano}`;

            let variacao = 0;
            let varClass = 'variacao-neutra';
            let varText = '0%';

            if (anoAnterior.votos > 0) {
                variacao = ((anoAtual.votos - anoAnterior.votos) / anoAnterior.votos) * 100;
                if (variacao > 0) {
                    varClass = 'variacao-positiva';
                    varText = `+${variacao.toFixed(1)}%`;
                } else if (variacao < 0) {
                    varClass = 'variacao-negativa';
                    varText = `${variacao.toFixed(1)}%`;
                } else {
                    varText = '0%';
                }
            }

            rows += `
                <tr>
                    <td>${periodo}</td>
                    <td>${anoAnterior.votos.toLocaleString('pt-BR')}</td>
                    <td>${anoAtual.votos.toLocaleString('pt-BR')}</td>
                    <td class="${varClass}">${varText}</td>
                </tr>
            `;
        }

        tbody.innerHTML = rows;
    }

    // Chamar updateVotosTab quando clicar na aba Votos
    document.querySelectorAll('.tab-btn[data-tab="votos"]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (activeCityId) {
                updateVotosTab(activeCityId);
            }
        });
    });

    // ============================================
    // INSIGHTS TAB SYSTEM
    // ============================================

    let chartVotosPorInv = null;
    let chartDistArea = null;
    let insightsFilters = {
        ano: 'all',
        area: 'all',
        tipo: 'all'
    };

    // Initialize Insights Tab
    function initInsightsTab() {
        const filterAno = document.getElementById('filter-insights-ano');
        const filterArea = document.getElementById('filter-insights-area');
        const filterTipo = document.getElementById('filter-insights-tipo');

        // Populate filters with unique values from investmentsData
        populateInsightsFilters();

        // Add event listeners
        if (filterAno) {
            filterAno.addEventListener('change', () => {
                insightsFilters.ano = filterAno.value;
                if (activeCityId) updateInsightsTab(activeCityId);
            });
        }

        if (filterArea) {
            filterArea.addEventListener('change', () => {
                insightsFilters.area = filterArea.value;
                if (activeCityId) updateInsightsTab(activeCityId);
            });
        }

        if (filterTipo) {
            filterTipo.addEventListener('change', () => {
                insightsFilters.tipo = filterTipo.value;
                if (activeCityId) updateInsightsTab(activeCityId);
            });
        }
    }

    // Populate Insights Filters
    function populateInsightsFilters() {
        const anos = [...new Set(investmentsData.map(i => i.ano))].sort((a, b) => b - a);
        const areas = [...new Set(investmentsData.map(i => i.area).filter(Boolean))].sort();
        const tipos = [...new Set(investmentsData.map(i => i.tipo).filter(Boolean))].sort();

        const filterAno = document.getElementById('filter-insights-ano');
        const filterArea = document.getElementById('filter-insights-area');
        const filterTipo = document.getElementById('filter-insights-tipo');

        if (filterAno) {
            filterAno.innerHTML = '<option value="all">Todos os Anos</option>';
            anos.forEach(ano => {
                filterAno.innerHTML += `<option value="${ano}">${ano}</option>`;
            });
        }

        if (filterArea) {
            filterArea.innerHTML = '<option value="all">Todas as Áreas</option>';
            areas.forEach(area => {
                filterArea.innerHTML += `<option value="${area}">${area}</option>`;
            });
        }

        if (filterTipo) {
            filterTipo.innerHTML = '<option value="all">Todos os Tipos</option>';
            tipos.forEach(tipo => {
                filterTipo.innerHTML += `<option value="${tipo}">${tipo}</option>`;
            });
        }
    }

    // Main Update Function for Insights Tab
    function updateInsightsTab(cityId) {
        const cityData = citiesData[cityId];
        if (!cityData) return;

        const habitantes = cityData.habitantes || 0;

        // Get city investments with filters applied
        let cityInvestments = investmentsData.filter(i => i.cityId === cityId);

        if (insightsFilters.ano !== 'all') {
            cityInvestments = cityInvestments.filter(i => i.ano == insightsFilters.ano);
        }
        if (insightsFilters.area !== 'all') {
            cityInvestments = cityInvestments.filter(i => i.area === insightsFilters.area);
        }
        if (insightsFilters.tipo !== 'all') {
            cityInvestments = cityInvestments.filter(i => i.tipo === insightsFilters.tipo);
        }

        // Get city votes
        const cityVotos = votosData[cityId] || [];

        // Calculate totals
        const totalInvestido = cityInvestments.reduce((sum, i) => sum + (i.valor || 0), 0);
        const totalVotos = cityVotos.reduce((sum, v) => sum + (v.votos || 0), 0);
        const invPorHabitante = habitantes > 0 ? totalInvestido / habitantes : 0;

        // Update KPI Cards
        document.getElementById('kpi-inv-habitante').textContent =
            `R$ ${invPorHabitante.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('kpi-total-votos').textContent =
            totalVotos.toLocaleString('pt-BR');
        document.getElementById('kpi-total-inv').textContent =
            `R$ ${totalInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Update Votos/Investimento por Ano
        updateEficienciaChart(cityInvestments, cityVotos);
        updateEficienciaTable(cityInvestments, cityVotos);

        // Update % por Área
        updateDistribuicaoAreaChart(cityInvestments, totalInvestido);
        updateAreaTable(cityInvestments, totalInvestido);
    }

    // Chart: Votos por R$ Investido (por Ano)
    function updateEficienciaChart(investments, votos) {
        const canvas = document.getElementById('chart-votos-por-inv');
        if (!canvas) return;

        // Group investments by year
        const invByYear = {};
        investments.forEach(i => {
            if (!invByYear[i.ano]) invByYear[i.ano] = 0;
            invByYear[i.ano] += i.valor || 0;
        });

        // Group votes by year
        const votosByYear = {};
        votos.forEach(v => {
            votosByYear[v.ano] = v.votos || 0;
        });

        // Find all years that have both data
        const allYears = [...new Set([...Object.keys(invByYear), ...Object.keys(votosByYear)])]
            .map(Number)
            .sort((a, b) => a - b);

        // Calculate efficiency (votos per R$1000)
        const labels = [];
        const data = [];

        allYears.forEach(ano => {
            const inv = invByYear[ano] || 0;
            const vot = votosByYear[ano] || 0;

            if (inv > 0 || vot > 0) {
                labels.push(ano.toString());
                // Votos per R$1000 invested
                const efficiency = inv > 0 ? (vot / inv) * 1000 : 0;
                data.push(efficiency);
            }
        });

        if (chartVotosPorInv) {
            chartVotosPorInv.destroy();
        }

        if (labels.length === 0) {
            canvas.parentElement.innerHTML = '<p class="no-data" style="padding: 2rem; text-align: center;">Sem dados para calcular eficiência.</p>';
            return;
        }

        chartVotosPorInv = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Votos por R$1.000',
                    data: data,
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.parsed.y.toFixed(2)} votos/R$1.000`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Votos/R$1.000'
                        }
                    }
                }
            }
        });
    }

    // Table: Eficiência por Ano
    function updateEficienciaTable(investments, votos) {
        const table = document.getElementById('table-eficiencia-ano');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        // Group by year
        const invByYear = {};
        investments.forEach(i => {
            if (!invByYear[i.ano]) invByYear[i.ano] = 0;
            invByYear[i.ano] += i.valor || 0;
        });

        const votosByYear = {};
        votos.forEach(v => {
            votosByYear[v.ano] = v.votos || 0;
        });

        const allYears = [...new Set([...Object.keys(invByYear), ...Object.keys(votosByYear)])]
            .map(Number)
            .sort((a, b) => b - a);

        if (allYears.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="no-data">Sem dados disponíveis.</td></tr>';
            return;
        }

        let rows = '';
        allYears.forEach(ano => {
            const inv = invByYear[ano] || 0;
            const vot = votosByYear[ano] || 0;
            const efficiency = inv > 0 ? (vot / inv) * 1000 : 0;

            // Determine efficiency class
            let efClass = '';
            if (efficiency > 5) efClass = 'eficiencia-alta';
            else if (efficiency > 1) efClass = 'eficiencia-media';
            else if (efficiency > 0) efClass = 'eficiencia-baixa';

            rows += `
                <tr class="${efClass}">
                    <td>${ano}</td>
                    <td>${vot.toLocaleString('pt-BR')}</td>
                    <td class="valor-cell">R$ ${inv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td><strong>${efficiency.toFixed(2)}</strong></td>
                </tr>
            `;
        });

        tbody.innerHTML = rows;
    }

    // Chart: Distribuição por Área (Doughnut)
    function updateDistribuicaoAreaChart(investments, total) {
        const canvas = document.getElementById('chart-dist-area');
        if (!canvas) return;

        // Group by area
        const byArea = {};
        investments.forEach(i => {
            const area = i.area || 'Não informado';
            if (!byArea[area]) byArea[area] = 0;
            byArea[area] += i.valor || 0;
        });

        const labels = Object.keys(byArea).sort((a, b) => byArea[b] - byArea[a]);
        const data = labels.map(area => byArea[area]);

        if (chartDistArea) {
            chartDistArea.destroy();
        }

        if (labels.length === 0) {
            canvas.parentElement.innerHTML = '<p class="no-data" style="padding: 2rem; text-align: center;">Sem dados de área.</p>';
            return;
        }

        const colors = [
            '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
            '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'
        ];

        chartDistArea = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 2,
                    borderColor: 'var(--card-bg)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 12,
                            padding: 8,
                            font: { size: 10 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const value = context.parsed;
                                const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${context.label}: R$ ${value.toLocaleString('pt-BR')} (${percent}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Table: Investimento por Área
    function updateAreaTable(investments, total) {
        const table = document.getElementById('table-inv-area');
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        // Group by area
        const byArea = {};
        investments.forEach(i => {
            const area = i.area || 'Não informado';
            if (!byArea[area]) byArea[area] = 0;
            byArea[area] += i.valor || 0;
        });

        const sortedAreas = Object.entries(byArea).sort((a, b) => b[1] - a[1]);

        if (sortedAreas.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="no-data">Sem dados disponíveis.</td></tr>';
            return;
        }

        let rows = '';
        sortedAreas.forEach(([area, valor]) => {
            const percent = total > 0 ? (valor / total) * 100 : 0;

            // Determine percent class
            let pClass = 'percent-low';
            if (percent > 30) pClass = 'percent-high';
            else if (percent > 15) pClass = 'percent-medium';

            rows += `
                <tr>
                    <td>${area}</td>
                    <td class="valor-cell">R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td class="percent-cell ${pClass}">${percent.toFixed(1)}%</td>
                </tr>
            `;
        });

        tbody.innerHTML = rows;
    }

    // Listen for tab clicks
    document.querySelectorAll('.tab-btn[data-tab="insights"]').forEach(btn => {
        btn.addEventListener('click', () => {
            populateInsightsFilters(); // Refresh filters
            if (activeCityId) {
                updateInsightsTab(activeCityId);
            }
        });
    });

    // Initialize insights system
    setTimeout(() => {
        initInsightsTab();
    }, 500);

    // ============================================
    // FILTROS DE DADOS IMPORTADOS
    // ============================================

    const campaignFiltersEl = document.getElementById('campaign-filters');
    const filterAnoEl = document.getElementById('filter-ano');
    const filterAreaEl = document.getElementById('filter-area');
    const filterTipoEl = document.getElementById('filter-tipo');

    // Filtros ativos
    let activeFilters = {
        ano: 'all',
        area: 'all',
        tipo: 'all'
    };

    // Mostrar/esconder filtros baseado na visualização
    function updateCampaignFiltersVisibility() {
        if (!campaignFiltersEl) return;

        const mode = visModeSelect ? visModeSelect.value : 'none';

        // Mostrar filtros para visualizações de campanha
        if (mode === 'heatmap-votes' || mode === 'heatmap-money') {
            campaignFiltersEl.classList.remove('hidden');
            populateCampaignFilters(mode);
        } else {
            campaignFiltersEl.classList.add('hidden');
        }
    }

    // Popular dropdowns de filtros com valores únicos
    function populateCampaignFilters(mode) {
        const anos = new Set();
        const areas = new Set();
        const tipos = new Set();

        if (mode === 'heatmap-votes') {
            // Dados de votos - apenas tem ano
            Object.values(votosData).forEach(cityVotos => {
                cityVotos.forEach(v => {
                    if (v.ano) anos.add(v.ano);
                });
            });
        } else if (mode === 'heatmap-money') {
            // Dados de investimentos - tem ano, area, tipo
            // Busca do objeto global investmentsData
            if (window.investmentsData && Array.isArray(window.investmentsData)) {
                window.investmentsData.forEach(inv => {
                    if (inv.ano) anos.add(inv.ano);
                    if (inv.area) areas.add(inv.area);
                    if (inv.tipo) tipos.add(inv.tipo);
                });
            }
        }

        // Popular Ano
        if (filterAnoEl) {
            const currentValue = filterAnoEl.value;
            filterAnoEl.innerHTML = '<option value="all">Todos os Anos</option>';
            [...anos].sort((a, b) => b - a).forEach(ano => {
                const opt = document.createElement('option');
                opt.value = ano;
                opt.textContent = ano;
                filterAnoEl.appendChild(opt);
            });
            filterAnoEl.value = currentValue || 'all';
        }

        // Popular Área (só para investimentos)
        if (filterAreaEl) {
            if (mode === 'heatmap-money') {
                filterAreaEl.closest('.filter-group').style.display = '';
                const currentValue = filterAreaEl.value;
                filterAreaEl.innerHTML = '<option value="all">Todas as Áreas</option>';
                [...areas].sort().forEach(area => {
                    const opt = document.createElement('option');
                    opt.value = area;
                    opt.textContent = area;
                    filterAreaEl.appendChild(opt);
                });
                filterAreaEl.value = currentValue || 'all';
            } else {
                filterAreaEl.closest('.filter-group').style.display = 'none';
            }
        }

        // Popular Tipo (só para investimentos)
        if (filterTipoEl) {
            if (mode === 'heatmap-money') {
                filterTipoEl.closest('.filter-group').style.display = '';
                const currentValue = filterTipoEl.value;
                filterTipoEl.innerHTML = '<option value="all">Todos os Tipos</option>';
                [...tipos].sort().forEach(tipo => {
                    const opt = document.createElement('option');
                    opt.value = tipo;
                    opt.textContent = tipo;
                    filterTipoEl.appendChild(opt);
                });
                filterTipoEl.value = currentValue || 'all';
            } else {
                filterTipoEl.closest('.filter-group').style.display = 'none';
            }
        }
    }

    // Atualizar campaignData com dados filtrados
    function applyDataFilters() {
        const mode = visModeSelect ? visModeSelect.value : 'none';

        // Reset campaignData temporariamente
        const filteredCampaignData = {};

        if (mode === 'heatmap-votes') {
            // Filtrar votos por ano
            Object.keys(votosData).forEach(slug => {
                let totalVotos = 0;
                votosData[slug].forEach(v => {
                    if (activeFilters.ano === 'all' || v.ano.toString() === activeFilters.ano) {
                        totalVotos += v.votos;
                    }
                });
                if (!filteredCampaignData[slug]) {
                    filteredCampaignData[slug] = { votes: 0, money: 0 };
                }
                filteredCampaignData[slug].votes = totalVotos;
            });

            // Atualiza campaignData global com votos filtrados
            Object.keys(filteredCampaignData).forEach(slug => {
                if (!campaignData[slug]) campaignData[slug] = { votes: 0, money: 0 };
                campaignData[slug].votes = filteredCampaignData[slug].votes;
            });

        } else if (mode === 'heatmap-money') {
            // Filtrar investimentos por ano, área e tipo
            if (window.investmentsData && Array.isArray(window.investmentsData)) {
                window.investmentsData.forEach(inv => {
                    const matchAno = activeFilters.ano === 'all' || inv.ano.toString() === activeFilters.ano;
                    const matchArea = activeFilters.area === 'all' || inv.area === activeFilters.area;
                    const matchTipo = activeFilters.tipo === 'all' || inv.tipo === activeFilters.tipo;

                    if (matchAno && matchArea && matchTipo) {
                        const slug = inv.cityId;
                        if (!filteredCampaignData[slug]) {
                            filteredCampaignData[slug] = { votes: 0, money: 0 };
                        }
                        filteredCampaignData[slug].money += inv.valor || 0;
                    }
                });

                // Atualiza campaignData global com investimentos filtrados
                // Primeiro limpa os valores de money
                Object.keys(campaignData).forEach(slug => {
                    campaignData[slug].money = 0;
                });
                Object.keys(filteredCampaignData).forEach(slug => {
                    if (!campaignData[slug]) campaignData[slug] = { votes: 0, money: 0 };
                    campaignData[slug].money = filteredCampaignData[slug].money;
                });
            }
        }

        updateMapDisplay();
    }

    // Event listeners para filtros
    if (filterAnoEl) {
        filterAnoEl.addEventListener('change', () => {
            activeFilters.ano = filterAnoEl.value;
            applyDataFilters();
        });
    }

    if (filterAreaEl) {
        filterAreaEl.addEventListener('change', () => {
            activeFilters.area = filterAreaEl.value;
            applyDataFilters();
        });
    }

    if (filterTipoEl) {
        filterTipoEl.addEventListener('change', () => {
            activeFilters.tipo = filterTipoEl.value;
            applyDataFilters();
        });
    }

    // Atualizar quando muda visualização
    if (visModeSelect) {
        visModeSelect.addEventListener('change', () => {
            // Reset filtros ao mudar visualização
            activeFilters = { ano: 'all', area: 'all', tipo: 'all' };
            if (filterAnoEl) filterAnoEl.value = 'all';
            if (filterAreaEl) filterAreaEl.value = 'all';
            if (filterTipoEl) filterTipoEl.value = 'all';

            updateCampaignFiltersVisibility();
        });
    }

    // Reset filtros no botão Limpar Filtros
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            activeFilters = { ano: 'all', area: 'all', tipo: 'all' };
            if (filterAnoEl) filterAnoEl.value = 'all';
            if (filterAreaEl) filterAreaEl.value = 'all';
            if (filterTipoEl) filterTipoEl.value = 'all';

            if (campaignFiltersEl) campaignFiltersEl.classList.add('hidden');
        });
    }

    // Carregar investimentos do servidor e atualiza campaignData
    async function loadInvestmentsForFilters() {
        try {
            const response = await fetch('/api/investments/data');
            if (response.ok) {
                const data = await response.json();
                if (data.investments && data.investments.length > 0) {
                    window.investmentsData = data.investments;
                    console.log(`Investimentos para filtros: ${window.investmentsData.length} registros`);

                    // Atualiza campaignData.money com totais de investimentos
                    const investmentTotals = {};
                    window.investmentsData.forEach(inv => {
                        const slug = inv.cityId;
                        if (!investmentTotals[slug]) {
                            investmentTotals[slug] = 0;
                        }
                        investmentTotals[slug] += inv.valor || 0;
                    });

                    // Aplica os totais ao campaignData
                    Object.keys(investmentTotals).forEach(slug => {
                        if (!campaignData[slug]) {
                            campaignData[slug] = { votes: 0, money: 0 };
                        }
                        campaignData[slug].money = investmentTotals[slug];
                    });
                }
            }
        } catch (error) {
            console.log('Erro ao carregar investimentos para filtros');
        }
    }

    // Inicializa carregamento de investimentos
    loadInvestmentsForFilters();

}); // End DOMContentLoaded Scope

