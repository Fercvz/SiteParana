document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const mapContainer = document.getElementById('map-container');
    const sidebar = document.getElementById('sidebar');
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
    const filterPop = document.getElementById('filter-pop');
    const filterArea = document.getElementById('filter-area');
    const resetFiltersBtn = document.getElementById('reset-filters');
    const highlightCount = document.getElementById('highlight-count');
    const valPop = document.getElementById('val-pop');
    const valArea = document.getElementById('val-area');

    // State
    let svgElement = null;
    let mapGroup = null;
    let citiesData = {};
    let activeCityId = null;
    let filters = {
        party: 'all',
        minPop: 0,
        minArea: 0
    };
    let currentVisMode = 'none';

    // Constants - Partidos com cores únicas e distintas
    const PARTIES = ['PSD', 'PL', 'PP', 'União Brasil', 'Republicanos', 'MDB', 'PT', 'Podemos', 'PDT', 'PSB', 'PSDB'];
    const PARTY_COLORS = {
        'PSD': '#1e40af',       // Azul escuro
        'PL': '#7c3aed',        // Roxo
        'PP': '#00bcd4',        // Ciano
        'União Brasil': '#10b981', // Verde esmeralda
        'Republicanos': '#f97316', // Laranja
        'MDB': '#ccff00',       // Verde limão bem claro
        'PT': '#dc2626',        // Vermelho
        'Podemos': '#ec4899',   // Rosa
        'PDT': '#9e9e9e',       // Cinza claro
        'PSB': '#ffff00',       // Amarelo grifa texto
        'PSDB': '#5d4037'       // Marrom escuro
    };

    // Pan/Zoom State
    let scale = 1;
    let pointX = 0;
    let pointY = 0;
    let isDragging = false;
    let startX, startY;

    // Check Protocol immediately
    if (window.location.protocol === 'file:') {
        mapContainer.innerHTML = `
            <div style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#fef2f2; color:#991b1b; padding:2rem; text-align:center;">
                <h2 style="font-size:2rem; margin-bottom:1rem;">⚠️ Acesso Bloqueado</h2>
                <p style="font-size:1.2rem; margin-bottom:2rem; max-width:600px;">
                    O navegador impede que este mapa carregue seus dados quando aberto diretamente como arquivo.
                </p>
                <div style="background:white; padding:2rem; border-radius:12px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); border:1px solid #fee2e2;">
                    <p style="margin-bottom:1rem; font-weight:600;">Por favor, use o novo servidor local (Porta 8082):</p>
                    <a href="http://localhost:8082" 
                       style="display:inline-block; background:#dc2626; color:white; font-weight:bold; padding:1rem 2rem; border-radius:8px; text-decoration:none; font-size:1.1rem; transition:transform 0.2s;">
                       🚀 Abrir Mapa (localhost:8082)
                    </a>
                </div>
            </div>
        `;
        return; // Stop execution
    }

    try {
        const svgResponse = await fetch('mapa_pr.svg');
        if (!svgResponse.ok) throw new Error(`Erro SVG: ${svgResponse.status} ${svgResponse.statusText}`);
        const svgText = await svgResponse.text();
        const mapSvgLayer = document.getElementById('map-svg-layer');
        if (mapSvgLayer) {
            mapSvgLayer.innerHTML = svgText;
            svgElement = mapSvgLayer.querySelector('svg');
        } else {
            // Fallback if index.html desyncs
            mapContainer.innerHTML = svgText;
            svgElement = mapContainer.querySelector('svg');
        }
        mapGroup = svgElement.querySelector('g') || svgElement;

        const jsonResponse = await fetch('cidades_pr.json');
        if (!jsonResponse.ok) throw new Error(`Erro JSON: ${jsonResponse.status} ${jsonResponse.statusText}`);
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

    // State - Dados Eleitorais
    let eleitoradoData = {};
    let chartInstances = {};

    function initApp() {
        injectMockData(); // Ensure complete data coverage
        initFilters();    // Populate dropdowns and setup ranges
        initMapInteractions();
        initSearch();
        setupZoomPan();
        initTabs();       // Sistema de abas
        loadEleitoradoData(); // Carrega dados eleitorais

        // Initial Render
        updateMapDisplay();
    }

    // Carrega dados eleitorais do TSE
    async function loadEleitoradoData() {
        try {
            const response = await fetch('dados_eleitorais.json');
            if (response.ok) {
                eleitoradoData = await response.json();
                console.log(`Dados eleitorais carregados: ${Object.keys(eleitoradoData).length} cidades`);
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

        // Set Ranges
        let maxPop = 0;
        let maxArea = 0;
        Object.values(citiesData).forEach(c => {
            if (c.habitantes > maxPop) maxPop = c.habitantes;
            if (c.area_km2 > maxArea) maxArea = c.area_km2;
        });

        // Add buffer
        maxPop = Math.ceil(maxPop / 10000) * 10000;
        maxArea = Math.ceil(maxArea / 100) * 100;

        if (filterPop) {
            filterPop.max = maxPop;
            filterPop.step = 1000;
        }
        if (filterArea) {
            filterArea.max = maxArea;
        }
    }


    // --- 2. Unified Map Display Logic ---
    function updateMapDisplay() {
        const paths = svgElement.querySelectorAll('path');
        let matchCount = 0;

        // Prepare Visualization Data
        let minVal = Infinity, maxVal = -Infinity;
        let dataField = null;
        let filteredCities = []; // Lista de cidades filtradas

        if (currentVisMode === 'heatmap-pop') {
            dataField = 'habitantes';
        } else if (currentVisMode === 'heatmap-pib') {
            dataField = 'pib_per_capita';
        }

        if (dataField) {
            Object.values(citiesData).forEach(c => {
                const val = parseFloat(c[dataField]) || 0;
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
            if (city.habitantes < filters.minPop) isMatch = false;
            if (city.area_km2 < filters.minArea) isMatch = false;

            // 2. Apply Base Visualization Color
            let fill = '';
            if (currentVisMode === 'party') {
                fill = PARTY_COLORS[city.partido] || '#ccc';
            } else if (dataField) {
                const val = parseFloat(city[dataField]) || 0;
                const ratio = (val - minVal) / (maxVal - minVal);
                fill = getHeatmapColor(ratio);
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
                // Adiciona cidade à lista de filtradas
                filteredCities.push({
                    nome: city.nome,
                    partido: city.partido
                });
            } else {
                path.classList.add('dimmed');
                path.classList.remove('highlight-filter');
            }
        });

        // Ordena cidades filtradas alfabeticamente
        filteredCities.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

        // Update UI
        if (highlightCount) highlightCount.innerText = matchCount;
        updateLegend(minVal, maxVal, dataField, filteredCities);

        // Toggle wrapper class for general CSS hints
        if (currentVisMode !== 'none') mapContainer.classList.add('visualizing');
        else mapContainer.classList.remove('visualizing');

        const hasFilters = filters.party !== 'all' || filters.minPop > 0 || filters.minArea > 0;
        if (hasFilters) mapContainer.classList.add('filtering');
        else mapContainer.classList.remove('filtering');
    }

    // Heatmap: Multi-stop gradient com mais cores para melhor interpretação
    function getHeatmapColor(t) {
        // Gradiente: Azul escuro -> Azul claro -> Ciano -> Verde -> Amarelo -> Laranja -> Vermelho
        if (t < 0.167) return interpolateColor('#1e3a8a', '#3b82f6', t / 0.167);           // Azul escuro -> Azul
        if (t < 0.333) return interpolateColor('#3b82f6', '#06b6d4', (t - 0.167) / 0.166); // Azul -> Ciano
        if (t < 0.5) return interpolateColor('#06b6d4', '#22c55e', (t - 0.333) / 0.167); // Ciano -> Verde
        if (t < 0.667) return interpolateColor('#22c55e', '#eab308', (t - 0.5) / 0.167);   // Verde -> Amarelo
        if (t < 0.833) return interpolateColor('#eab308', '#f97316', (t - 0.667) / 0.166); // Amarelo -> Laranja
        return interpolateColor('#f97316', '#dc2626', (t - 0.833) / 0.167);                // Laranja -> Vermelho
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
        legendContainer.innerHTML = '';
        legendContainer.classList.add('hidden');

        if (currentVisMode === 'party') {
            legendContainer.innerHTML = '<strong>Legenda (Partidos)</strong>';

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = '1fr 1fr';
            grid.style.gap = '5px';

            Object.keys(PARTY_COLORS).forEach(label => {
                const color = PARTY_COLORS[label];
                const div = document.createElement('div');
                div.className = 'legend-item';
                div.innerHTML = `<div class="legend-color" style="background:${color}"></div><span>${label}</span>`;
                grid.appendChild(div);
            });
            legendContainer.appendChild(grid);
            legendContainer.classList.remove('hidden');

        } else if (dataField) {
            let title = '';
            let formatFn;

            if (dataField === 'habitantes') {
                title = 'Habitantes (Mapa de Calor)';
                formatFn = (v) => v.toLocaleString('pt-BR');
            } else if (dataField === 'pib_per_capita') {
                title = 'PIB per capita (Mapa de Calor)';
                formatFn = (v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }

            legendContainer.innerHTML = `<strong>${title}</strong>`;
            const div = document.createElement('div');
            div.style.display = 'flex';
            div.style.flexDirection = 'column';
            div.style.gap = '4px';
            div.innerHTML = `
                <div style="height:14px; background: linear-gradient(to right, #1e3a8a, #3b82f6, #06b6d4, #22c55e, #eab308, #f97316, #dc2626); border-radius:3px;"></div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem;">
                    <span>${formatFn(min)}</span>
                    <span>${formatFn(max)}</span>
                </div>
            `;
            legendContainer.appendChild(div);
            legendContainer.classList.remove('hidden');
        }

        // Mostrar lista de cidades filtradas quando há filtro por partido
        if (filters.party !== 'all' && filteredCities.length > 0) {
            updateFilteredCitiesList(filteredCities);
        } else {
            // Remove a lista se não houver filtro por partido
            const existingList = document.getElementById('filtered-cities-panel');
            if (existingList) existingList.remove();
        }
    }

    // Função para mostrar lista de cidades filtradas
    function updateFilteredCitiesList(cities) {
        let panel = document.getElementById('filtered-cities-panel');

        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'filtered-cities-panel';
            document.body.appendChild(panel);
        }

        const partyColor = PARTY_COLORS[filters.party] || '#666';

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:8px; border-bottom:2px solid ${partyColor};">
                <strong style="font-size:1rem; color:var(--text-primary, #333);">Cidades - ${filters.party}</strong>
                <span style="background:${partyColor}; color:white; padding:2px 8px; border-radius:12px; font-size:0.85rem;">${cities.length}</span>
            </div>
            <ul style="list-style:none; padding:0; margin:0; font-size:0.9rem;">
                ${cities.map(c => `
                    <li style="padding:6px 0; border-bottom:1px solid var(--border-color, #f0f0f0); cursor:pointer; transition:background 0.2s; color:var(--text-primary, #333);" 
                        onmouseover="this.style.background='var(--bg-secondary, #f9fafb)'; this.style.color='var(--accent-color, #2563eb)'" 
                        onmouseout="this.style.background='transparent'; this.style.color='var(--text-primary, #333)'"
                        onclick="document.getElementById('city-search').value='${c.nome}'; document.getElementById('search-btn').click();">
                        ${c.nome}
                    </li>
                `).join('')}
            </ul>
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
            filters.minPop = parseInt(filterPop.value, 10) || 0;
            filters.minArea = parseInt(filterArea.value, 10) || 0;

            if (valPop) valPop.innerText = filters.minPop.toLocaleString('pt-BR');
            if (valArea) valArea.innerText = filters.minArea.toLocaleString('pt-BR');

            updateMapDisplay();
        };

        if (filterParty) filterParty.addEventListener('change', handleFilterChange);
        if (filterPop) filterPop.addEventListener('input', handleFilterChange);
        if (filterArea) filterArea.addEventListener('input', handleFilterChange);

        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                filterParty.value = 'all';
                filterPop.value = 0;
                filterArea.value = 0;
                visModeSelect.value = 'none';

                filters = { party: 'all', minPop: 0, minArea: 0 };
                currentVisMode = 'none';

                if (valPop) valPop.innerText = '0';
                if (valArea) valArea.innerText = '0';

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
            const val = citySearch.value.toLowerCase();
            const id = Object.keys(citiesData).find(key => citiesData[key].nome.toLowerCase() === val);
            if (id) selectCity(id);
            else alert('Cidade não encontrada.');
        };

        document.getElementById('search-btn').addEventListener('click', perform);
        citySearch.addEventListener('keypress', (e) => { if (e.key === 'Enter') perform(); });
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

            // 3. Show loading bubble
            const loadingId = appendLoading();

            try {
                // Call Backend
                const response = await fetch('http://localhost:8082/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: text,
                        city_context: cityContext,
                        mayor_context: mayorContext,
                        site_stats: siteStats
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

}); // End DOMContentLoaded Scope
