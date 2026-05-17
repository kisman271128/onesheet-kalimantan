// ── Auth ────────────────────────────────────────────────────────
        let USERS = [];          // loaded from users.json
        let currentRole = '';    // 'depo' | 'region' | 'admin'
        let currentDepo = '';    // e.g. 'BALIKPAPAN' — hanya untuk role depo

        async function sha256(str) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
        }

        async function loadUsers() {
            try {
                const res = await fetch('users.json');
                if (!res.ok) throw new Error('users.json tidak ditemukan');
                const data = await res.json();
                USERS = data.users || [];
            } catch(e) {
                console.warn('Gagal memuat users.json:', e.message);
                USERS = [];
            }
        }

        let rawData = [];
        let viewType = '';
        let selectedDepo = '';
        let WEEKS_CONFIG = [];
        let currentTab = 'weekly';
        let tgData = null;
        let projectData = null;
        let catData = null;

        // Load TG data on page load
        async function loadTGData(depoSuffix) {
            if (!depoSuffix) return;

            // Helper: apply TG data ke UI
            const applyTGData = (data, source) => {
                tgData = data;
                const dayClosing = tgData['Day Closing'] || tgData['Day_Closing'] || 'N/A';
                document.getElementById('lastUpdateDate').textContent = dayClosing;
                const dashboardUpdateEl = document.getElementById('dashboardLastUpdate');
                if (dashboardUpdateEl) dashboardUpdateEl.textContent = dayClosing;
                const tgDCEl = document.getElementById('tgDayClosing');
                if (tgDCEl) {
                    tgDCEl.textContent = dayClosing;
                    document.getElementById('tgUpdateDisplay').style.display = '';
                }
                console.log(`TG loaded from: ${source} | last_updated: ${tgData.last_updated || tgData['Day Closing'] || '-'}`);
            };

            // Helper: ambil last_updated dari metadata json sebagai Date object
            const getUpdatedTime = (json) => {
                const ts = (json.metadata && json.metadata.last_updated) ? json.metadata.last_updated : null;
                return ts ? new Date(ts) : new Date(0);
            };

            let jsonDepo = null, jsonLama = null;

            // Fetch TG_DEPO_xxx.json (format baru)
            try {
                const res = await fetch(`TG_DEPO_${depoSuffix}.json`);
                if (res.ok) jsonDepo = await res.json();
            } catch(e) { /* tidak ada */ }

            // Fetch TG.json (format lama) — 404 dibiarkan silent, file opsional
            try {
                const res2 = await fetch('TG.json');
                if (res2.ok) {
                    jsonLama = await res2.json();
                } else if (res2.status !== 404) {
                    console.warn('TG.json fetch error:', res2.status);
                }
            } catch(e) { /* network error, diabaikan */ }

            // Pilih yang paling update
            if (jsonDepo && jsonLama) {
                const tDepo = getUpdatedTime(jsonDepo);
                const tLama = getUpdatedTime(jsonLama);
                if (tDepo >= tLama) {
                    applyTGData(jsonDepo.data || {}, `TG_DEPO_${depoSuffix}.json`);
                } else {
                    applyTGData(jsonLama.data || {}, 'TG.json (lebih baru)');
                }
            } else if (jsonDepo) {
                applyTGData(jsonDepo.data || {}, `TG_DEPO_${depoSuffix}.json`);
            } else if (jsonLama) {
                applyTGData(jsonLama.data || {}, 'TG.json (fallback)');
            } else {
                console.log('TG data tidak tersedia');
                document.getElementById('lastUpdateDate').textContent = 'N/A';
            }
        }

        // Tampilkan logo RSF di halaman login (initial)
        document.getElementById('cornerLogo')?.classList.add('visible');

        // ── Login slideshow ─────────────────────────────────────────────
        let _loginSlide = 0;
        const _loginSlides = document.querySelectorAll('.login-slide');
        const _loginDots   = document.querySelectorAll('.login-dot');

        function goToSlide(n) {
            _loginSlides[_loginSlide].classList.remove('active');
            _loginDots[_loginSlide].classList.remove('active');
            _loginSlide = n;
            _loginSlides[_loginSlide].classList.add('active');
            _loginDots[_loginSlide].classList.add('active');
        }

        // Auto-rotate every 4 seconds
        setInterval(() => goToSlide((_loginSlide + 1) % _loginSlides.length), 4000);

        document.getElementById('loginForm').addEventListener('submit', async e => {
            e.preventDefault();
            const u = document.getElementById('username').value.trim();
            const p = document.getElementById('password').value;
            const hashed = await sha256(p);
            const found = USERS.find(usr => usr.username === u && usr.hash === hashed);
            if (found) {
                sessionStorage.setItem('user', u);
                sessionStorage.setItem('role', found.role);
                sessionStorage.setItem('userDepo', found.depo || '');
                currentRole = found.role;
                currentDepo = found.depo || '';
                if (found.role === 'depo') {
                    viewType = 'depo';
                    selectedDepo = 'data_DEPO_' + found.depo;
                    sessionStorage.setItem('view', 'depo');
                    sessionStorage.setItem('depo', selectedDepo);
                    showDashboard();
                } else {
                    showPage('selectionPage');
                    const adminOpt = document.getElementById('adminOptionCard');
                    const hkOpt = document.getElementById('hariKerjaOptionCard');
                    if (adminOpt) adminOpt.style.display = found.role === 'admin' ? '' : 'none';
                    if (hkOpt) hkOpt.style.display = found.role === 'admin' ? '' : 'none';
                }
            } else {
                document.getElementById('errorMsg').classList.remove('hidden');
            }
        });

        // ========================================
        // UPLOAD DATA FUNCTIONS (GitHub Integration)
        // ========================================
        
        // GitHub configuration - loaded from config.json
        const GITHUB_CONFIG = {
            owner: '',
            repo: '',
            token: '',
            branch: 'master'
        };

        async function loadConfig() {
            try {
                const res = await fetch('config.json');
                if (!res.ok) throw new Error('config.json tidak ditemukan');
                const cfg = await res.json();
                GITHUB_CONFIG.token  = cfg.github_token  || '';
                GITHUB_CONFIG.owner  = cfg.github_owner  || '';
                GITHUB_CONFIG.repo   = cfg.github_repo   || '';
                GITHUB_CONFIG.branch = cfg.github_branch || 'master';
            } catch(e) {
                console.warn('Gagal memuat config.json:', e.message);
            }
        }
        
        // ============================================================
        //  UPLOAD FUNCTIONS - FOLDER AUTO-DETECT
        // ============================================================

        let folderHandle    = null;   // DirectoryHandle dari showDirectoryPicker
        let detectedFiles   = {};     // { data: FileHandle, bti: FileHandle, project: FileHandle, tg: FileHandle }

        function setUploadExpectedFilenames() {
            const depoSuffix = selectedDepo.replace('data_DEPO_', '');
            document.getElementById('label-data').textContent    = 'data_DEPO_'    + depoSuffix + '.json';
            document.getElementById('label-bti').textContent     = 'bti_DEPO_'     + depoSuffix + '.json';
            document.getElementById('label-project').textContent = 'project_DEPO_' + depoSuffix + '.json';
            document.getElementById('label-tg').textContent      = 'TG_DEPO_'      + depoSuffix + '.json';
            document.getElementById('label-cat').textContent     = 'cat_DEPO_'     + depoSuffix + '.json';
            document.getElementById('label-bp').textContent      = 'bp_DEPO_'      + depoSuffix + '.json';
            document.getElementById('label-trend').textContent   = 'trend_DEPO_'   + depoSuffix + '.json';
            document.getElementById('label-outlet').textContent  = 'outlet_DEPO_'  + depoSuffix + '.json';
            document.getElementById('label-sku').textContent     = 'sku_DEPO_'     + depoSuffix + '.json';
            document.getElementById('label-proses').textContent  = 'proses_DEPO_'  + depoSuffix + '.json';
            document.getElementById('label-25outlet-cat').textContent = '25outlet_cat_DEPO_' + depoSuffix + '.json';
            // Reset state saat depo berubah
            folderHandle  = null;
            detectedFiles = {};
            document.getElementById('folderName').textContent = '';
            document.getElementById('uploadDetectSection').style.display = 'none';
            document.getElementById('uploadStatus').style.display = 'none';
            // Reset semua card ke state awal
            ['data','bti','project','tg','cat','bp','trend','outlet','sku','proses'].forEach(k => {
                const c = document.getElementById('card-' + k);
                if (c) { c.classList.remove('found','missing','uploading','done'); }
                const d = document.getElementById('detect-' + k);
                if (d) d.innerHTML = '<span class="upl-dot upl-dot-wait"></span>Menunggu';
                const u = document.getElementById('upload-' + k);
                if (u) u.innerHTML = '';
            });
        }

        async function pickFolder() {
            // Cek dukungan browser
            if (!window.showDirectoryPicker) {
                showUploadStatus('error',
                    '❌ Browser Anda tidak mendukung fitur pilih folder otomatis.<br>' +
                    'Gunakan <strong>Google Chrome</strong> atau <strong>Microsoft Edge</strong> versi terbaru.');
                return;
            }
            try {
                folderHandle = await window.showDirectoryPicker({ mode: 'read' });
                document.getElementById('folderName').textContent = '📁 ' + folderHandle.name;
                document.getElementById('uploadDetectSection').style.display = 'block';
                document.getElementById('uploadStatus').style.display = 'none';
                await scanFolder();
            } catch(e) {
                if (e.name !== 'AbortError') {
                    showUploadStatus('error', '❌ Gagal membuka folder: ' + e.message);
                }
            }
        }

        async function scanFolder() {
            if (!folderHandle) return;
            detectedFiles = {};

            const slots = [
                { key: 'data',    icon: '📊' },
                { key: 'bti',     icon: '🏆' },
                { key: 'project', icon: '📋' },
                { key: 'tg',      icon: '⏱️'  },
                { key: 'cat',     icon: '📦' },
                { key: 'bp',      icon: '🎯' },
                { key: 'trend',   icon: '📈' },
                { key: 'outlet',  icon: '🏪' },
                { key: 'sku',     icon: '🛒' },
                { key: 'proses',      icon: '⚙️'  },
                { key: '25outlet-cat', icon: '🏪' }
            ];

            let foundCount   = 0;
            let missingNames = [];

            for (const s of slots) {
                const expectedName = document.getElementById('label-' + s.key).textContent.trim();
                const detectEl     = document.getElementById('detect-' + s.key);
                detectEl.innerHTML = '<span class="upl-dot upl-dot-loading"></span><span style="color:#94a3b8;">Mencari...</span>';
                const cardEl = document.getElementById('card-' + s.key);
                if (cardEl) { cardEl.classList.remove('found','missing','uploading','done'); }
                try {
                    const fileHandle = await folderHandle.getFileHandle(expectedName);
                    detectedFiles[s.key] = fileHandle;
                    const file = await fileHandle.getFile();
                    const sizeKB = (file.size / 1024).toFixed(1);
                    detectEl.innerHTML = '<span class="upl-dot upl-dot-found"></span><span style="color:#16a34a;">Ditemukan</span> <span style="color:#94a3b8;font-size:10px;">' + sizeKB + ' KB</span>';
                    if (cardEl) cardEl.classList.add('found');
                    foundCount++;
                } catch(e) {
                    detectedFiles[s.key] = null;
                    missingNames.push('<code style="background:#fee2e2;padding:1px 5px;border-radius:3px;">' + expectedName + '</code>');
                    detectEl.innerHTML = '<span class="upl-dot upl-dot-missing"></span><span style="color:#dc2626;">Tidak ada</span>';
                    if (cardEl) cardEl.classList.add('missing');
                }
            }

            // Summary bar
            const bar = document.getElementById('uploadSummaryBar');
            const btn = document.getElementById('btnUploadAll');
            if (foundCount === 0) {
                bar.style.cssText = 'display:block; border-radius:8px; padding:10px 16px; margin-bottom:14px; font-size:13px; background:#fff5f5; border:1px solid #fca5a5; color:#dc2626;';
                bar.innerHTML = '❌ Tidak ada file yang cocok ditemukan di folder ini. Pastikan folder yang dipilih benar.';
                btn.style.display = 'none';
            } else {
                const warningHtml = missingNames.length > 0
                    ? '<br><span style="color:#b45309;">⚠️ File tidak ditemukan: ' + missingNames.join(', ') + ' — tidak akan diupload.</span>'
                    : '';
                bar.style.cssText = 'display:block; border-radius:8px; padding:10px 16px; margin-bottom:14px; font-size:13px; background:#f0fdf4; border:1px solid #86efac; color:#166534;';
                bar.innerHTML = '✅ <strong>' + foundCount + ' dari ' + slots.length + ' file</strong> siap diupload.' + warningHtml;
                btn.style.display = 'block';
                btn.textContent = '📤 Upload ' + foundCount + ' File ke GitHub';
            }
        }

        async function uploadAllFiles() {
            const slots = [
                { key: 'data',    label: 'Data OneSheet'  },
                { key: 'bti',     label: 'Data BTI'       },
                { key: 'project', label: 'Data Project'   },
                { key: 'tg',      label: 'TG (Time Gone)' },
                { key: 'cat',     label: 'Data Category'  },
                { key: 'bp',      label: 'Data BP'        },
                { key: 'trend',   label: 'Data Trend'     },
                { key: 'outlet',  label: 'Pareto Outlet'  },
                { key: 'sku',     label: 'Pareto SKU'     },
                { key: 'proses',      label: 'Proses'          },
                { key: '25outlet-cat', label: '25 Outlet Cat'   }
            ];

            const toUpload = slots.filter(s => detectedFiles[s.key]);
            if (toUpload.length === 0) {
                showUploadStatus('error', '❌ Tidak ada file yang terdeteksi. Pilih folder terlebih dahulu.');
                return;
            }

            document.getElementById('btnUploadAll').disabled = true;
            showUploadStatus('info', '⏳ Memulai upload ' + toUpload.length + ' file...');

            let successCount = 0, failCount = 0;
            const results = [];

            for (const s of toUpload) {
                const detectEl = document.getElementById('detect-' + s.key);
                const cardEl2  = document.getElementById('card-' + s.key);
                detectEl.innerHTML = '<span class="upl-dot upl-dot-loading"></span><span style="color:#f59e0b;">Mengupload...</span>';
                if (cardEl2) { cardEl2.classList.remove('found','missing','done'); cardEl2.classList.add('uploading'); }
                try {
                    const fileHandle = detectedFiles[s.key];
                    const file       = await fileHandle.getFile();
                    const text       = await file.text();
                    const jsonData   = JSON.parse(text);
                    const content    = JSON.stringify(jsonData, null, 2);
                    const recordCount = Array.isArray(jsonData.data) ? jsonData.data.length
                                      : (typeof jsonData.data === 'object' ? Object.keys(jsonData.data).length : 0);
                    const depoMeta   = (jsonData.metadata && jsonData.metadata.depo) ? jsonData.metadata.depo : '';

                    const uploadCell = document.getElementById('upload-' + s.key);
                    const ok = await uploadToGitHub(file.name, content);
                    if (ok) {
                        await logUploadActivity(file.name, recordCount, depoMeta);
                        detectEl.innerHTML = '<span class="upl-dot upl-dot-found"></span><span style="color:#16a34a;">Uploaded</span>';
                        if (uploadCell) uploadCell.innerHTML = '<span style="color:#16a34a;font-weight:700;">✅ ' + recordCount + ' rec</span>';
                        if (cardEl2) { cardEl2.classList.remove('uploading'); cardEl2.classList.add('done'); }
                        results.push('✅ <strong>' + file.name + '</strong> — ' + recordCount + ' records');
                        successCount++;
                    } else {
                        detectEl.innerHTML = '<span class="upl-dot upl-dot-missing"></span><span style="color:#dc2626;">Gagal</span>';
                        if (uploadCell) uploadCell.innerHTML = '<span style="color:#dc2626;font-weight:700;">❌ Gagal</span>';
                        if (cardEl2) { cardEl2.classList.remove('uploading'); cardEl2.classList.add('missing'); }
                        results.push('❌ <strong>' + file.name + '</strong> — Gagal upload ke GitHub');
                        failCount++;
                    }
                } catch(e) {
                    const label = document.getElementById('label-' + s.key).textContent;
                    document.getElementById('detect-' + s.key).innerHTML = '<span class="upl-dot upl-dot-missing"></span><span style="color:#dc2626;">Error</span>';
                    if (cardEl2) { cardEl2.classList.remove('uploading'); cardEl2.classList.add('missing'); }
                    results.push('❌ <strong>' + label + '</strong> — ' + e.message);
                    failCount++;
                }
            }

            document.getElementById('btnUploadAll').disabled = false;
            const type = failCount === 0 ? 'success' : (successCount === 0 ? 'error' : 'info');
            const summary = (successCount > 0 ? '✅ <strong>' + successCount + ' file berhasil diupload</strong>' : '')
                          + (failCount > 0 ? (successCount > 0 ? ' &nbsp;|&nbsp; ' : '') + '❌ <strong>' + failCount + ' file gagal</strong>' : '')
                          + '<br><br>' + results.join('<br>');
            showUploadStatus(type, summary + (successCount > 0 ? '<br><br>⏳ Dashboard akan reload dalam 3 detik...' : ''));

            if (successCount > 0) setTimeout(() => location.reload(), 3000);
        }

        async function uploadJSON() { await uploadAllFiles(); }

                // ============================================================
        //  CATEGORY TAB FUNCTIONS
        // ============================================================

        async function loadCategoryData() {
            const loading = document.getElementById('loadingCategory');
            // Jika Summary Regional, data sudah di-load oleh loadSummaryRegionalData()
            if (selectedDepo === 'data_SUMMARY' && catData && catData.length > 0) {
                loading.style.display = 'none';
                loadCatSalesmanList();
                renderCategoryTab('');
                return;
            }
            loading.style.display = 'block';
            loading.textContent = '⏳ Memuat data Category...';
            document.getElementById('catTableWrap').innerHTML = '';
            try {
                const depoSuffix = selectedDepo.replace('data_DEPO_', '');
                // Load semua file Category secara paralel (Promise.all)
                const [resCat, resBti, resBp, resRaw] = await Promise.all([
                    fetch('cat_DEPO_'  + depoSuffix + '.json'),
                    fetch('bti_DEPO_'  + depoSuffix + '.json'),
                    fetch('bp_DEPO_'   + depoSuffix + '.json'),
                    fetch('data_DEPO_' + depoSuffix + '.json'),
                ]);
                if (!resCat.ok) throw new Error('cat_DEPO_' + depoSuffix + '.json tidak ditemukan');
                catData             = (await resCat.json()).data || [];
                window.catBtiData   = resBti.ok ? ((await resBti.json()).data || []) : [];
                window.catBpData    = resBp.ok  ? ((await resBp.json()).data  || []) : [];
                window.catRawData   = resRaw.ok ? ((await resRaw.json()).data || []) : (rawData || []);
                loading.style.display = 'none';
                loadCatSalesmanList();
                renderCategoryTab('');
            } catch(e) {
                loading.textContent = '❌ ' + e.message;
            }
        }

        function loadCatSalesmanList() {
			const sel = document.getElementById('catSalesmanSelect');
			while (sel.options.length > 1) sel.remove(1);
			
			const map = {};
			catData.forEach(r => {
				const sm = r['Nama Salesman'] || '';
				if (sm && map[sm] === undefined) {
					map[sm] = (r['Tim'] || '').trim();
				}
			});

			Object.keys(map).sort().forEach(sm => {
				const opt = document.createElement('option');
				opt.value        = sm;
				opt.textContent  = sm;
				opt.dataset.tipe = map[sm];
				sel.appendChild(opt);
			});
		}

        function filterCategory() {
            const sel = document.getElementById('catSalesmanSelect');
            const sm  = sel.value;
            const tipeSpan = document.getElementById('catSalesmanTipe');
            tipeSpan.textContent = (sm && sel.selectedIndex > 0)
                ? (sel.options[sel.selectedIndex].dataset.tipe ? 'Tipe Salesman: ' + sel.options[sel.selectedIndex].dataset.tipe : '')
                : '';
            renderCategoryTab(sm);
        }

        function renderCategoryTab(filterSalesman) {
            const wrap = document.getElementById('catTableWrap');
            document.getElementById('catToggleBtns').style.display = 'flex';
            if (!catData || catData.length === 0) { wrap.innerHTML = '<p style="color:#888;padding:20px;">Tidak ada data.</p>'; return; }

            const SALES_COLS = ['LY','LM2','LM1','LM','L3M'];
            const ALL_COLS   = ['LY','LM2','LM1','LM','L3M','BP','BE','MTD'];

            // Number formatter (millions)
            const fmt = (n, dark) => {
                if (n === null || n === undefined || isNaN(n) || n === 0) return '<span style="color:#b0b8c9;">-</span>';
                const abs = Math.abs(n), neg = n < 0;
                const v   = abs / 1e6;
                let s;
                if (v >= 1000)      s = v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'jt';
                else if (v >= 1)    s = v.toFixed(1) + 'jt';
                else if (abs >= 1000) s = (abs/1e3).toFixed(0) + 'rb';
                else                 s = abs.toFixed(0);
                const color = neg ? '#e53e3e' : (dark ? '#e2e8f0' : '#1a202c');
                return '<span style="color:' + color + ';">' + (neg ? '-' : '') + s + '</span>';
            };

            // --- BUILD SALES TREE from cat data ---
            const catRows = filterSalesman ? catData.filter(r => (r['Nama Salesman']||'') === filterSalesman) : catData;
            const tree = {};
            catRows.forEach(r => {
                const pr = r.Principle || 'Unknown';
                const gr = r.PwC_Grp3  || 'Unknown';
                const tp = r.TYPE      || 'Unknown';
                // MTD selalu pakai key 'MTD'; LM1/LM2/LM pakai Periode1; sisanya pakai Periode
                const basePe = r.Periode || '';
                const pe = (basePe === 'MTD') ? 'MTD' : (r.Periode1 || basePe);
                const v  = parseFloat(r.NetSalesPKD || 0);
                if (!tree[pr])         tree[pr] = {};
                if (!tree[pr][gr])     tree[pr][gr] = {};
                if (!tree[pr][gr][tp]) tree[pr][gr][tp] = {};
                tree[pr][gr][tp][pe] = (tree[pr][gr][tp][pe] || 0) + v;
                // Akumulasi ke L3M jika baris ini adalah bagian dari L3M period
                if (basePe === 'L3M' && pe !== 'L3M') {
                    tree[pr][gr][tp]['L3M'] = (tree[pr][gr][tp]['L3M'] || 0) + v;
                }
            });

            // =====================================================================
            // BP LOGIC
            // =====================================================================
            const bpRows = window.catBpData || [];

            // Dapatkan Tim salesman (scope luar agar bisa dipakai di filter Principle)
            const smTim = filterSalesman ? (() => {
				const freq = {};
				catData
					.filter(r => (r['Nama Salesman'] || '') === filterSalesman)
					.forEach(r => {
						const t = (r['Tim'] || '').trim();
						if (t) freq[t] = (freq[t] || 0) + 1;
					});
				const keys = Object.keys(freq);
				if (!keys.length) return '';
				return keys.reduce((a, b) => freq[a] >= freq[b] ? a : b);
			})() : '';
            const validTims = ['Bima', 'Arjuna'];
            const useTimFilter = validTims.includes(smTim);

            // --- BE TOTAL dari data_DEPO field "BE", filter by salesman jika ada ---
            const rawRows = filterSalesman
                ? (window.catRawData||[]).filter(r => (r['Nama Salesman']||'') === filterSalesman)
                : (window.catRawData||[]);
            const beTotal = rawRows.reduce((s, r) => s + parseFloat(r.BE || 0), 0);

            // --- Build L3M sums untuk distribusi BE ---
            const l3mTree  = {};
            const l3mByPr  = {};
            const l3mByGr  = {};
            let   l3mTotal = 0;
            catRows.forEach(r => {
                if ((r.Periode || '') !== 'L3M') return;
                const pr = r.Principle || 'Unknown';
                const gr = r.PwC_Grp3  || 'Unknown';
                const tp = r.TYPE      || 'Unknown';
                const v  = parseFloat(r.NetSalesPKD || 0);
                if (!l3mTree[pr])      l3mTree[pr] = {};
                if (!l3mTree[pr][gr])  l3mTree[pr][gr] = {};
                l3mTree[pr][gr][tp] = (l3mTree[pr][gr][tp] || 0) + v;
                l3mByPr[pr]         = (l3mByPr[pr]         || 0) + v;
                l3mByGr[pr+'||'+gr] = (l3mByGr[pr+'||'+gr] || 0) + v;
                l3mTotal += v;
            });


            if (!filterSalesman) {
                // ---- ALL SALESMAN: BP & MTD langsung dari bp_DEPO ----
                // Aggregasi T.BP dan MTD per (Principle, PwC_Grp3, TYPE)
                const bpByType = {}; // "pr||gr||tp" → { BP, MTDfromBP }
                bpRows.forEach(r => {
                    const pr = r.Principle || 'Unknown';
                    const gr = r.PwC_Grp3  || 'Unknown';
                    const tp = r.TYPE      || 'Unknown';
                    const key = pr + '||' + gr + '||' + tp;
                    if (!bpByType[key]) bpByType[key] = { BP: 0, MTDfromBP: 0 };
                    bpByType[key].BP        += parseFloat(r['T.BP'] || 0);
                    bpByType[key].MTDfromBP += parseFloat(r.MTD     || 0);
                });

                // Override MTD di tree dari bp_DEPO (All Salesman)
                Object.keys(tree).forEach(pr => {
                    Object.keys(tree[pr]).forEach(gr => {
                        Object.keys(tree[pr][gr]).forEach(tp => {
                            const key = pr + '||' + gr + '||' + tp;
                            if (bpByType[key]) {
                                tree[pr][gr][tp]['MTD'] = bpByType[key].MTDfromBP;
                            }
                        });
                    });
                });

                var getAlloc = (pr, gr, tp) => {
                    const key = pr + '||' + gr + '||' + tp;
                    return { BP: bpByType[key]?.BP || 0, BE: l3mTotal > 0 ? beTotal * ((l3mTree[pr]?.[gr]?.[tp] || 0) / l3mTotal) : 0 };
                };
                var getAllocGr = (pr, gr) => {
                    let bp = 0, be = 0;
                    const grL3M = l3mByGr[pr + '||' + gr] || 0;
                    if (tree[pr] && tree[pr][gr]) {
                        Object.keys(tree[pr][gr]).forEach(tp => {
                            const key = pr + '||' + gr + '||' + tp;
                            bp += bpByType[key]?.BP || 0;
                        });
                    }
                    be = l3mTotal > 0 ? beTotal * (grL3M / l3mTotal) : 0;
                    return { BP: bp, BE: be };
                };

            } else {
                // ---- PER SALESMAN: BP Principle dari bti, distribusi dari bp_DEPO ----

                // BP Principle dari bti filtered by salesman
                const btiRows = (window.catBtiData||[]).filter(r => (r.szName||'') === filterSalesman);
                const btiByPr = {};
                btiRows.forEach(r => {
                    const pr = r.LOB || r.szPrincipalGroupId || 'Unknown';
                    if (!btiByPr[pr]) btiByPr[pr] = { BP: 0 };
                    btiByPr[pr].BP += parseFloat(r.decTargetAdjustment || 0);
                });

                // smTim, validTims, useTimFilter sudah dideklarasikan di scope luar

                // Build kontribusi dari bp_DEPO
                // bpContrib[pr][gr][tp] = T.BP (filtered by Tim jika applicable)
                // bpContribPr[pr] = total T.BP untuk Principle (filtered by Tim)
                const bpContrib  = {}; // pr → gr → tp → T.BP
                const bpContribPrGr = {}; // pr||gr → T.BP
                const bpContribPr  = {}; // pr → T.BP

                bpRows.forEach(r => {
                    const rTim = (r.Tim || '').trim();
                    const pr   = r.Principle || 'Unknown';
                    const gr   = r.PwC_Grp3  || 'Unknown';
                    const tp   = r.TYPE      || 'Unknown';
                    const v    = parseFloat(r['T.BP'] || 0);

                    // Filter by Tim jika salesman bukan Yudistira
                    if (useTimFilter && rTim !== smTim) return;

                    if (!bpContrib[pr])       bpContrib[pr] = {};
                    if (!bpContrib[pr][gr])   bpContrib[pr][gr] = {};
                    bpContrib[pr][gr][tp]  = (bpContrib[pr][gr][tp]  || 0) + v;
                    bpContribPrGr[pr+'||'+gr] = (bpContribPrGr[pr+'||'+gr] || 0) + v;
                    bpContribPr[pr]           = (bpContribPr[pr]           || 0) + v;
                });

                // getAlloc: BP Type = BP_Principle × (T.BP type / T.BP principle)
                var getAlloc = (pr, gr, tp) => {
                    const prBP    = btiByPr[pr]?.BP || 0;
                    const prTotal = bpContribPr[pr] || 0;
                    const tpVal   = bpContrib[pr]?.[gr]?.[tp] || 0;
                    const bp      = prTotal > 0 ? prBP * (tpVal / prTotal) : 0;
                    const be      = l3mTotal > 0 ? beTotal * ((l3mTree[pr]?.[gr]?.[tp] || 0) / l3mTotal) : 0;
                    return { BP: bp, BE: be };
                };
                // getAllocGr: BP Category = BP_Principle × (T.BP category / T.BP principle)
                var getAllocGr = (pr, gr) => {
                    const prBP    = btiByPr[pr]?.BP || 0;
                    const prTotal = bpContribPr[pr] || 0;
                    const grVal   = bpContribPrGr[pr+'||'+gr] || 0;
                    const bp      = prTotal > 0 ? prBP * (grVal / prTotal) : 0;
                    const grL3M   = l3mByGr[pr+'||'+gr] || 0;
                    const be      = l3mTotal > 0 ? beTotal * (grL3M / l3mTotal) : 0;
                    return { BP: bp, BE: be };
                };
            }


            // Helper: aggregate sales cols for a level
            const agg = (data) => {
                const s = {};
                SALES_COLS.forEach(c => { s[c] = 0; });
                Object.values(data).forEach(child => {
                    if (typeof child === 'object') {
                        SALES_COLS.forEach(c => { s[c] += (child[c] || 0); });
                    }
                });
                return s;
            };
            const aggGrp = (grpData) => {
                const s = {};
                ALL_COLS.forEach(c => { s[c] = 0; });
                Object.values(grpData).forEach(tpData => {
                    ALL_COLS.forEach(c => { s[c] += (tpData[c] || 0); });
                });
                return s;
            };

            // --- MERGE: RANS, GSJ, Others → satu baris OTHERS ---
            const OTHERS_MERGE = ['RANS', 'GSJ', 'Others'];
            const othersData = {}; // gr → tp → col data (merged)
            OTHERS_MERGE.forEach(pr => {
                if (!tree[pr]) return;
                Object.keys(tree[pr]).forEach(gr => {
                    Object.keys(tree[pr][gr]).forEach(tp => {
                        if (!othersData[gr]) othersData[gr] = {};
                        if (!othersData[gr][tp]) othersData[gr][tp] = {};
                        ALL_COLS.forEach(c => {
                            othersData[gr][tp][c] = (othersData[gr][tp][c] || 0) + (tree[pr][gr][tp][c] || 0);
                        });
                    });
                });
                delete tree[pr];
            });
            if (Object.keys(othersData).length > 0) tree['OTHERS'] = othersData;

            // --- FILTER Principle sesuai Tim (khusus per salesman, bukan Yudistira) ---
            if (filterSalesman && useTimFilter) {
                // Kumpulkan Principle yang ada di bp_DEPO untuk Tim ini
                const validPrinciples = new Set();
                bpRows.forEach(r => {
                    if ((r.Tim || '').trim() === smTim) {
                        validPrinciples.add(r.Principle || 'Unknown');
                    }
                });
                // Tambahkan OTHERS jika salah satu dari OTHERS_MERGE ada di validPrinciples
                const othersInBp = OTHERS_MERGE.some(p => validPrinciples.has(p));
                if (othersInBp) validPrinciples.add('OTHERS');
                // Hapus Principle dari tree yang tidak ada di bp_DEPO untuk Tim ini
                Object.keys(tree).forEach(pr => {
                    if (!validPrinciples.has(pr)) delete tree[pr];
                });
            }

            // --- RENDER ---
            let html = '<table>';
            html += '<colgroup>';
            html += '<col style="width:130px;">';  // label
            ['LY','LM2','LM1','LM','L3M','BP','BE','MTD'].forEach(() => { html += '<col style="width:55px;">'; });
            ['Gap BP','Gap BE','vs BP','vs BE','BE vs BP'].forEach(() => { html += '<col style="width:50px;">'; });
            html += '</colgroup>';

            const TH      = 'padding:5px 3px; font-size:9px; font-weight:700; text-transform:uppercase; background:#1e3a5f; color:white; border-bottom:2px solid #0e7490; position:sticky; top:0; z-index:10; text-align:center;';
            const TH_BPBE = TH.replace('#1e3a5f','#0e7490');
            const TH_GAP  = TH.replace('#1e3a5f','#374151');
            const TH_VS   = TH.replace('#1e3a5f','#065f46');
            const TH_BEVSBP = TH.replace('#1e3a5f','#4c1d95');
            html += '<thead><tr>';
            html += '<th style="' + TH + ' text-align:left;">PRINCIPLE / CATEGORY / TYPE</th>';
            ['LY','LM2','LM1','LM'].forEach(c => { html += '<th style="' + TH + '">' + c + '</th>'; });
            html += '<th style="' + TH + '">L3M<br><span style="font-size:7px;opacity:0.8;">avg/bln</span></th>';
            html += '<th style="' + TH_BPBE + '">BP</th>';
            html += '<th style="' + TH_BPBE + '">BE</th>';
            html += '<th style="' + TH + '">MTD</th>';
            html += '<th style="' + TH_GAP + '">Gap BP</th>';
            html += '<th style="' + TH_GAP + '">Gap BE</th>';
            html += '<th style="' + TH_VS  + '">vs BP</th>';
            html += '<th style="' + TH_VS  + '">vs BE</th>';
            html += '<th style="' + TH_BEVSBP + '">BE vs BP</th>';
            html += '</tr></thead><tbody>';

            // --- Gap formatter ---
            const fmtGap = (mtd, target) => {
                const gap = mtd - target;
                if (!target && !mtd) return '<span style="color:#b0b8c9;">-</span>';
                const abs = Math.abs(gap), neg = gap < 0;
                const v = abs / 1e6;
                let s = abs >= 1e6 ? v.toFixed(1)+'jt' : abs >= 1e3 ? (abs/1e3).toFixed(0)+'rb' : abs.toFixed(0);
                const color = neg ? '#dc2626' : '#16a34a';
                return '<span style="color:' + color + ';font-weight:600;">' + (neg ? '-' : '+') + s + '</span>';
            };
            // --- vs % formatter ---
            const fmtVs = (a, b) => {
                if (!b) return '<span style="color:#b0b8c9;">-</span>';
                const pct = a / b * 100;
                let bg, color;
                if (pct >= 100)     { bg = '#16a34a'; color = 'white'; }
                else if (pct >= 90) { bg = '#fef08a'; color = '#713f12'; }
                else                { bg = '#fee2e2'; color = '#dc2626'; }
                return '<span style="background:' + bg + ';color:' + color + ';padding:1px 4px;border-radius:3px;font-weight:700;font-size:9px;">' + pct.toFixed(1) + '%</span>';
            };

            // Helper: render satu set kolom angka
            const fmtRow = (data, bp, be, style) => {
                const mtd = data['MTD'] || 0;
                let s = '';
                ['LY','LM2','LM1','LM'].forEach(c => { s += '<td class="c-right" style="' + style + '">' + fmt(data[c] || 0) + '</td>'; });
                s += '<td class="c-right" style="' + style + '">' + fmt((data['L3M'] || 0) / 3) + '</td>';
                s += '<td class="c-right c-bp-be" style="' + style + '">' + fmt(bp) + '</td>';
                s += '<td class="c-right c-bp-be" style="' + style + '">' + fmt(be) + '</td>';
                s += '<td class="c-right" style="' + style + '">' + fmt(mtd) + '</td>';
                s += '<td class="c-right" style="' + style + 'padding:3px;">' + fmtGap(mtd, bp) + '</td>';
                s += '<td class="c-right" style="' + style + 'padding:3px;">' + fmtGap(mtd, be) + '</td>';
                s += '<td class="c-right" style="padding:3px; text-align:center;">' + fmtVs(mtd, bp) + '</td>';
                s += '<td class="c-right" style="padding:3px; text-align:center;">' + fmtVs(mtd, be) + '</td>';
                s += '<td class="c-right" style="padding:3px; text-align:center;">' + fmtVs(be, bp) + '</td>';
                return s;
            };

            // --- Hitung Grand Total dulu ---
            const grandTot = {};
            ALL_COLS.forEach(c => { grandTot[c] = 0; });
            let grandBP = 0, grandBE = beTotal;
            Object.keys(tree).sort().forEach(pr => {
                Object.values(tree[pr]).forEach(grpData => {
                    Object.values(grpData).forEach(tpData => {
                        ALL_COLS.forEach(c => { grandTot[c] += (tpData[c] || 0); });
                    });
                });
                // grandBP = sum semua getAllocGr across all gr
                Object.keys(tree[pr]).forEach(gr => { grandBP += getAllocGr(pr, gr).BP; });
            });

            // GRAND TOTAL — baris pertama setelah header
            html += '<tr style="background:#FFC715; color:white; border-bottom:2px solid #0e7490;">';
            html += '<td class="c-left" style="padding:7px 8px 7px 10px; font-weight:700; font-size:11px; color:white; border-left:3px solid #38bdf8; white-space:nowrap;">All Exc. Seasonal/ABBOTT/Flora</td>';
            html += fmtRow(grandTot, grandBP, grandBE, 'font-weight:700; color:white;');
            html += '</tr>';

            // --- Render tiap Principle ---
            let rowNum = 0;
            Object.keys(tree).sort().forEach(pr => {
                const prData   = tree[pr];
                const prTotSls = {};
                ALL_COLS.forEach(c => { prTotSls[c] = 0; });
                Object.values(prData).forEach(grpData => {
                    Object.values(grpData).forEach(tpData => {
                        ALL_COLS.forEach(c => { prTotSls[c] += (tpData[c] || 0); });
                    });
                });
                // BP Principle = sum dari semua Category BP, BE = sum dari semua TYPE BE
                let prBP = 0, prBE = 0;
                Object.keys(prData).forEach(gr => {
                    prBP += getAllocGr(pr, gr).BP;
                    Object.keys(prData[gr]).forEach(tp => { prBE += getAlloc(pr, gr, tp).BE; });
                });
                const prId = 'cat-pr-' + (rowNum++);

                html += '<tr data-gid="' + prId + '" style="background:white; cursor:pointer; border-bottom:1px solid #e2e8f0;" onclick="toggleCatGroup(this.dataset.gid)">';
                html += '<td class="c-left" style="padding:7px 8px 7px 10px; font-weight:700; font-size:11px; color:#1e293b; border-left:3px solid #0e7490;">';
                html += '<span id="ico-' + prId + '" style="margin-right:6px; color:#0e7490; font-size:10px;">▶</span>' + pr + '</td>';
                html += fmtRow(prTotSls, prBP, prBE, 'font-weight:700; color:#1e293b;');
                html += '</tr>';

                Object.keys(prData).sort().forEach(gr => {
                    const grData   = prData[gr];
                    const grTotSls = aggGrp(grData);
                    const grBpBe   = getAllocGr(pr, gr);

                    html += '<tr class="' + prId + '" style="display:none; background:#dbeafe; border-bottom:1px solid #bfdbfe;">';
                    html += '<td class="c-left" style="padding:5px 8px 5px 18px; font-weight:700; font-size:11px; color:#1e3a5f;">▸ ' + gr + '</td>';
                    html += fmtRow(grTotSls, grBpBe.BP, grBpBe.BE, 'color:#334155; font-weight:600;');
                    html += '</tr>';

                    Object.keys(grData).sort().forEach(tp => {
                        const tpData = grData[tp];
                        const tpBpBe = getAlloc(pr, gr, tp);
                        html += '<tr class="' + prId + '" style="display:none; background:white; border-bottom:1px solid #f1f5f9;">';
                        html += '<td class="c-left" style="padding:4px 8px 4px 34px; font-size:10px; color:#64748b;">↳ ' + tp + '</td>';
                        html += fmtRow(tpData, tpBpBe.BP, tpBpBe.BE, 'color:#475569; font-size:10px;');
                        html += '</tr>';
                    });
                });
            });

            html += '</tbody></table></div>';
            wrap.innerHTML = html;
        }

        function toggleCatAll(expand) {
            document.querySelectorAll('[data-gid^="cat-pr-"]').forEach(tr => {
                const gid = tr.dataset.gid;
                const ico = document.getElementById('ico-' + gid);
                if (!ico) return;
                const isOpen = ico.textContent === '▼';
                if (expand && !isOpen) {
                    ico.textContent = '▼';
                    document.querySelectorAll('tr.' + gid).forEach(r => r.style.display = '');
                } else if (!expand && isOpen) {
                    ico.textContent = '▶';
                    document.querySelectorAll('tr.' + gid).forEach(r => r.style.display = 'none');
                }
            });
        }

        function toggleCatGroup(groupId) {
            const ico  = document.getElementById('ico-' + groupId);
            const rows = document.querySelectorAll('tr.' + groupId);
            const isOpen = ico && ico.textContent === '▼';
            if (ico) ico.textContent = isOpen ? '▶' : '▼';
            rows.forEach(r => { r.style.display = isOpen ? 'none' : ''; });
        }

                async function uploadToGitHub(filename, content) {
            try {
                // Check if file exists (to get SHA for update)
                const checkUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filename}`;
                
                let sha = null;
                try {
                    const checkRes = await fetch(checkUrl, {
                        headers: {
                            'Authorization': `token ${GITHUB_CONFIG.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    if (checkRes.ok) {
                        const data = await checkRes.json();
                        sha = data.sha;
                    }
                } catch (e) {
                    console.log('File does not exist yet, will create new');
                }
                
                // Upload/Update file
                const uploadUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filename}`;
                
                const username = sessionStorage.getItem('user') || 'unknown';
                const depoName = selectedDepo.replace('data_', '').replace('.json', '').replace(/_/g, ' ');
                
                const body = {
                    message: `Update ${filename} by ${username} (${depoName}) - ${new Date().toLocaleString('id-ID')}`,
                    content: btoa(unescape(encodeURIComponent(content))), // Base64 encode
                    branch: GITHUB_CONFIG.branch
                };
                
                if (sha) {
                    body.sha = sha; // Required for updating existing file
                }
                
                const uploadRes = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                
                if (!uploadRes.ok) {
                    const error = await uploadRes.json();
                    console.error('GitHub upload error:', error);
                    return false;
                }
                
                return true;
                
            } catch (error) {
                console.error('Upload to GitHub failed:', error);
                return false;
            }
        }
        
        async function logUploadActivity(filename, recordCount, depoName) {
            try {
                // Get existing log
                const logUrl = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/upload_log.json`;
                
                let existingLog = [];
                let sha = null;
                
                try {
                    const logRes = await fetch(logUrl, {
                        headers: {
                            'Authorization': `token ${GITHUB_CONFIG.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    });
                    
                    if (logRes.ok) {
                        const logData = await logRes.json();
                        sha = logData.sha;
                        const content = atob(logData.content);
                        existingLog = JSON.parse(content);
                    }
                } catch (e) {
                    console.log('No existing log, will create new');
                }
                
                // Add new entry
                const username = sessionStorage.getItem('user') || 'unknown';
                const newEntry = {
                    timestamp: new Date().toISOString(),
                    date: new Date().toLocaleString('id-ID'),
                    user: username,
                    depo: depoName || filename.replace('data_', '').replace('.json', '').replace(/_/g, ' '),
                    filename: filename,
                    recordCount: recordCount
                };
                
                existingLog.unshift(newEntry); // Add to beginning
                
                // Keep only last 100 entries
                if (existingLog.length > 100) {
                    existingLog = existingLog.slice(0, 100);
                }
                
                // Upload updated log
                const logContent = JSON.stringify(existingLog, null, 2);
                const body = {
                    message: `Log upload activity - ${username} (${depoName})`,
                    content: btoa(unescape(encodeURIComponent(logContent))),
                    branch: GITHUB_CONFIG.branch
                };
                
                if (sha) {
                    body.sha = sha;
                }
                
                await fetch(logUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${GITHUB_CONFIG.token}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(body)
                });
                
                console.log('Activity logged successfully');
                
            } catch (error) {
                console.error('Failed to log activity:', error);
                // Don't fail the upload if logging fails
            }
        }
        
        function clearUploadedData() {
            showUploadStatus('info', 'ℹ️ Upload ke GitHub bersifat permanen.<br>Untuk menghapus, hubungi admin atau upload file baru untuk replace.');
        }
        
        function checkUploadedData() {
            // No need to check localStorage anymore
            // Data always from GitHub
            document.getElementById('uploadedFileInfo').style.display = 'none';
        }
        
        function showUploadStatus(type, message) {
            const statusDiv = document.getElementById('uploadStatus');
            const colors = {
                'success': '#d4edda',
                'error': '#f8d7da',
                'info': '#d1ecf1'
            };
            const textColors = {
                'success': '#155724',
                'error': '#721c24',
                'info': '#0c5460'
            };
            
            statusDiv.style.display = 'block';
            statusDiv.style.background = colors[type] || colors.info;
            statusDiv.style.color = textColors[type] || textColors.info;
            statusDiv.style.border = `1px solid ${textColors[type] || textColors.info}`;
            statusDiv.innerHTML = message;
        }

        window.onload = async () => {
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                await loadConfig();
            }
            await loadUsers();
            loadDepoList();
            if (sessionStorage.getItem('user')) {
                currentRole = sessionStorage.getItem('role') || 'region';
                currentDepo = sessionStorage.getItem('userDepo') || '';
                if (sessionStorage.getItem('depo')) {
                    selectedDepo = sessionStorage.getItem('depo');
                    viewType = sessionStorage.getItem('view');
                    showDashboard();
                } else {
                    showPage('selectionPage');
                    const adminOpt = document.getElementById('adminOptionCard');
                    const hkOpt = document.getElementById('hariKerjaOptionCard');
                    if (adminOpt) adminOpt.style.display = currentRole === 'admin' ? '' : 'none';
                    if (hkOpt) hkOpt.style.display = currentRole === 'admin' ? '' : 'none';
                }
            }
        };

        function showPage(id) {
            ['loginPage', 'selectionPage', 'depoPage', 'dashboard'].forEach(p => {
                document.getElementById(p).classList.add('hidden');
                document.getElementById(p).style.display = 'none';
            });
            document.getElementById(id).classList.remove('hidden');
            document.getElementById(id).style.display = id === 'dashboard' ? 'block' : 'flex';
            // Tampilkan logo RSF hanya di halaman login
            const logo = document.getElementById('cornerLogo');
            if (logo) logo.classList.toggle('visible', id === 'loginPage');
        }

        function selectView(type) {
            viewType = type;
            sessionStorage.setItem('view', type);
            if (type === 'summary') {
                selectedDepo = 'data_SUMMARY';
                sessionStorage.setItem('depo', 'data_SUMMARY');
                showDashboard();
            } else {
                // Depo user tidak boleh pilih depo lain
                if (currentRole === 'depo') {
                    selectedDepo = 'data_DEPO_' + currentDepo;
                    sessionStorage.setItem('depo', selectedDepo);
                    showDashboard();
                } else {
                    showPage('depoPage');
                }
            }
        }

        async function loadDepoList() {
            try {
                const res = await fetch('depo_list.json');
                const data = await res.json();
                const sel = document.getElementById('depoSelect');
                sel.innerHTML = '<option value="">-- Pilih Depo --</option>';
                data.depos.forEach(depo => {
                    let cleanName = depo.toUpperCase().trim().replace(/^DEPO\s+/i, '');
                    const opt = document.createElement('option');
                    opt.value = `data_DEPO_${cleanName.replace(/\s+/g, '_')}`;
                    opt.textContent = cleanName;
                    sel.appendChild(opt);
                });
            } catch (e) { console.error('depo_list.json error:', e); }
        }

        function loadDepoData() {
            const sel = document.getElementById('depoSelect');
            selectedDepo = sel.value;
            if (!selectedDepo) {
                alert('Pilih depo terlebih dahulu');
                return;
            }
            sessionStorage.setItem('depo', selectedDepo);
            showDashboard();
        }

        function backToLogin() {
            sessionStorage.clear();
            location.reload();
        }

        function backToSelection() {
            showPage('selectionPage');
        }

        function changeDepo() {
            const fl = document.getElementById('depoStatusFloat');
            if (fl) fl.remove();
            sessionStorage.removeItem('depo');
            sessionStorage.removeItem('view');
            // Depo user hanya bisa balik ke depo sendiri atau summary
            if (currentRole === 'depo') {
                showDepoSwitchModal();
            } else {
                showPage('selectionPage');
                const adminOpt = document.getElementById('adminOptionCard');
                const hkOpt = document.getElementById('hariKerjaOptionCard');
                if (adminOpt) adminOpt.style.display = currentRole === 'admin' ? '' : 'none';
                if (hkOpt) hkOpt.style.display = currentRole === 'admin' ? '' : 'none';
            }
        }

        function goToDepoSummary() {
            const fl = document.getElementById('depoStatusFloat');
            if (fl) fl.remove();
            sessionStorage.removeItem('depo');
            sessionStorage.removeItem('view');
            showDepoSwitchModal();
        }

        function showDepoSwitchModal() {
            // Modal sederhana untuk depo user: pilih depo sendiri atau summary
            const modal = document.getElementById('depoSwitchModal');
            if (modal) { modal.style.display = 'flex'; return; }
            const m = document.createElement('div');
            m.id = 'depoSwitchModal';
            m.style.cssText = 'position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
            m.innerHTML = `
              <div style="background:white;border-radius:16px;padding:28px;width:320px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 16px;color:#1e293b;">Pilih Tampilan</h3>
                <div class="option-card" style="margin-bottom:10px;" onclick="switchToMyDepo()">
                  <h3>🏪 Depo Saya</h3>
                  <p>${currentDepo.replace(/_/g,' ')}</p>
                </div>
                <div class="option-card" style="margin-bottom:16px;" onclick="switchToSummary()">
                  <h3>🏢 Summary Regional</h3>
                  <p>Ringkasan semua depo</p>
                </div>
                <button class="btn btn-secondary" onclick="document.getElementById('depoSwitchModal').style.display='none';showPage('dashboard');">Batal</button>
              </div>`;
            document.body.appendChild(m);
        }

        function switchToMyDepo() {
            document.getElementById('depoSwitchModal').style.display = 'none';
            viewType = 'depo';
            selectedDepo = 'data_DEPO_' + currentDepo;
            sessionStorage.setItem('view', 'depo');
            sessionStorage.setItem('depo', selectedDepo);
            showDashboard();
        }

        function switchToSummary() {
            document.getElementById('depoSwitchModal').style.display = 'none';
            viewType = 'summary';
            selectedDepo = 'data_SUMMARY';
            sessionStorage.setItem('view', 'summary');
            sessionStorage.setItem('depo', 'data_SUMMARY');
            showDashboard();
        }

        function logout() {
            sessionStorage.clear();
            location.reload();
        }

        // ===== SUMMARY DASHBOARD =====
        let _summaryCharts = {};
        function destroySummaryChart(id) {
            if (_summaryCharts[id]) { try { _summaryCharts[id].destroy(); } catch(e){} delete _summaryCharts[id]; }
        }


        // ═══════════════════════════════════════════════════════════════
        // SUMMARY REGIONAL — Agregasi semua data dari seluruh depo
        // ═══════════════════════════════════════════════════════════════
        // Normalisasi nama depo dari depo_list.json → nama file
        // "Depo Tanjung" → "TANJUNG", "KUTAI KARTANEGARA" → "KUTAI_KARTANEGARA"
        function normalizeDepoName(raw) {
            let s = String(raw).trim().toUpperCase();
            if (s.startsWith('DEPO ')) s = s.slice(5);
            return s.replace(/\s+/g, '_').replace(/\//g, '_');
        }

        async function loadSummaryRegionalData() {
            // Ambil daftar depo dari depo_list.json
            let rawDepos = [];
            try {
                const res = await fetch('depo_list.json');
                if (res.ok) {
                    const dl = await res.json();
                    rawDepos = dl.depos || [];
                }
            } catch(e) { console.warn('depo_list.json error:', e); }

            if (rawDepos.length === 0) {
                console.warn('depo_list kosong, pakai rawData existing');
                return;
            }

            // Normalisasi nama depo ke format file
            const depos = rawDepos.map(normalizeDepoName);
            console.log('Summary Regional: loading', depos.length, 'depos:', depos);

            // Tampilkan loading panel status depo
            const loadingEl = document.getElementById('loadingSummaryDash');
            if (loadingEl) loadingEl.innerHTML = '⏳ Memuat data ' + depos.length + ' depo...';

            // Fetch dengan tracking status per depo
            const fetchJSON = async (url) => {
                try {
                    const r = await fetch(url);
                    if (!r.ok) return null; // null = tidak ditemukan
                    const j = await r.json();
                    return { data: j.data || [], meta: j.metadata || {} };
                } catch(e) { return null; }
            };

            const results = await Promise.all(depos.map(depo => Promise.all([
                fetchJSON('data_DEPO_'    + depo + '.json'),
                fetchJSON('bp_DEPO_'     + depo + '.json'),
                fetchJSON('cat_DEPO_'    + depo + '.json'),
                fetchJSON('bti_DEPO_'    + depo + '.json'),
                fetchJSON('project_DEPO_'+ depo + '.json'),
            ])));

            // Agregasi + tracking status
            const aggData = [], aggBp = [], aggCat = [], aggBti = [], aggProj = [];
            const depoAchMap  = {};
            const depoStatus  = {}; // { TANJUNG: { found: true, lastUpdate: '...', hasData: true } }

            results.forEach(([dataR, bpR, catR, btiR, projR], idx) => {
                const depo     = depos[idx];
                const rawDepo  = rawDepos[idx];
                const hasData  = dataR !== null;
                const hasBP    = bpR   !== null;
                // Status & tanggal HANYA dari bp_DEPO — jika tidak ada = belum upload
                const lastUpd  = hasBP ? (bpR?.meta?.last_updated || null) : null;

                depoStatus[depo] = {
                    label:      rawDepo,
                    found:      hasBP,
                    lastUpdate: lastUpd,
                };

                if (hasData) {
                    dataR.data.forEach(r => aggData.push({...r, _depo: depo}));
                    // Cache per-depo data by full label for By Depo tab
                    if (!window._depoDataByLabel) window._depoDataByLabel = {};
                    window._depoDataByLabel[rawDepo] = dataR.data;
                    window._depoDataByLabel[depo]    = dataR.data; // also by suffix
                }
                if (hasBP)   bpR.data.forEach(r   => aggBp.push({...r,  _depo: depo}));
                if (catR)    catR.data.forEach(r   => aggCat.push({...r, _depo: depo}));
                if (btiR)    btiR.data.forEach(r   => aggBti.push({...r, _depo: depo}));
                if (projR)   projR.data.forEach(r  => aggProj.push({...r,_depo: depo}));

                // Klasemen Depo — dari bp
                let dMTD=0, dBP=0, dBE=0, dLY=0, dLM=0;
                if (hasBP) bpR.data.forEach(r => {
                    dMTD += Number(r.MTD    || 0);
                    dBP  += Number(r['T.BP']|| 0);
                    dBE  += Number(r.BE     || 0);
                    dLY  += Number(r.LY     || 0);
                    dLM  += Number(r.LM     || 0);
                });
                if (dMTD > 0 || dBP > 0) {
                    depoAchMap[depo] = { label: rawDepo, MTD: dMTD, BP: dBP, BE: dBE, LY: dLY, LM: dLM };
                }
            });

            // Hitung statistik
            const found   = Object.values(depoStatus).filter(d => d.found).length;
            const missing = Object.values(depoStatus).filter(d => !d.found).length;

            // Set global data
            rawData             = aggData;
            window.catBpData    = aggBp;
            catData             = aggCat;
            window.catBtiData   = aggBti;
            window.catRawData   = aggData;
            window._projectData = aggProj;
            window._depoAchMap  = depoAchMap;
            window._depoStatus  = depoStatus;
            window._klasemenLoaded = false; // Reset so Klasemen will re-render on next visit

            console.log('Summary Regional loaded:', found, 'depos found,', missing, 'not found');
        }

        function renderDepoStatusPanel() {
            return ''; // Diganti float button - lihat initDepoStatusFloat()
        }

        function initDepoStatusFloat() {
            const old = document.getElementById('depoStatusFloat');
            if (old) old.remove();

            const status  = window._depoStatus || {};
            const entries = Object.values(status);
            if (entries.length === 0) return;

            const found   = entries.filter(d => d.found);
            const missing = entries.filter(d => !d.found);
            const allOk   = missing.length === 0;
            const btnBg   = allOk ? '#16a34a' : '#f97316';
            const badge   = missing.length > 0 ? String(missing.length) : '\u2713';

            // Ambil tanggal saja (tanpa jam) untuk perbandingan
            const toDateStr = (s) => {
                if (!s) return null;
                try {
                    const d = new Date(s.replace(' ', 'T'));
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                } catch { return null; }
            };

            // Cari tanggal terbaru (date string, YYYY-MM-DD)
            const datestrs = found.map(d => toDateStr(d.lastUpdate)).filter(Boolean);
            const maxDate  = datestrs.length > 0 ? datestrs.reduce((a,b) => a > b ? a : b) : null;

            const fmtDate = (s) => {
                if (!s) return '\u2014';
                try {
                    const d = new Date(s.replace(' ', 'T'));
                    return d.toLocaleDateString('id-ID', {day:'2-digit',month:'short',year:'numeric'});
                } catch { return s; }
            };

            const dateColor = (s) => {
                const ds = toDateStr(s);
                if (!ds || !maxDate) return '#94a3b8';
                return ds === maxDate ? '#16a34a' : '#dc2626';
            };

            const foundRows = found.map(d =>
                '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #f1f5f9;font-size:11px;">'
                + '<span style="color:#16a34a;font-size:12px;">\u2705</span>'
                + '<span style="flex:1;font-weight:600;color:#334155;">' + d.label + '</span>'
                + '<span style="color:' + dateColor(d.lastUpdate) + ';font-size:10px;font-weight:700;white-space:nowrap;">' + fmtDate(d.lastUpdate) + '</span>'
                + '</div>'
            ).join('');

            const missingRows = missing.map(d =>
                '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #fff7ed;font-size:11px;">'
                + '<span style="font-size:12px;">\u26a0\ufe0f</span>'
                + '<span style="flex:1;font-weight:600;color:#9a3412;">' + d.label + '</span>'
                + '<span style="color:#f97316;font-size:10px;">Belum upload data</span>'
                + '</div>'
            ).join('');

            const wrap = document.createElement('div');
            wrap.id = 'depoStatusFloat';
            wrap.innerHTML =
              '<button id="depoStatusBtn" onclick="var p=document.getElementById(\'depoStatusPopup\');p.style.display=p.style.display===\'none\'?\'\':\'none\';" '
              + 'style="position:fixed;bottom:24px;right:24px;z-index:9999;background:' + btnBg + ';color:white;border:none;border-radius:50px;'
              + 'padding:10px 16px;font-size:12px;font-weight:700;cursor:pointer;'
              + 'box-shadow:0 4px 16px rgba(0,0,0,0.2);display:flex;align-items:center;gap:7px;transition:transform 0.15s;"'
              + ' onmouseover="this.style.transform=\'scale(1.05)\'" onmouseout="this.style.transform=\'scale(1)\'">'
              + '\ud83c\udfe2 Status Depo '
              + '<span style="background:white;color:' + btnBg + ';border-radius:20px;padding:1px 8px;font-size:11px;font-weight:800;">' + badge + '</span>'
              + '</button>'
              + '<div id="depoStatusPopup" style="display:none;position:fixed;bottom:72px;right:24px;z-index:9998;'
              + 'width:300px;max-height:420px;overflow-y:auto;background:white;border-radius:12px;'
              + 'box-shadow:0 8px 30px rgba(0,0,0,0.18);padding:14px 16px;">'
              + '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;'
              + 'margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">'
              + '<span>\ud83c\udfe2 Status Depo (' + found.length + '/' + entries.length + ')</span>'
              + '<span onclick="document.getElementById(\'depoStatusPopup\').style.display=\'none\'" '
              + 'style="cursor:pointer;color:#94a3b8;font-size:15px;line-height:1;">\u00d7</span>'
              + '</div>'
              + foundRows
              + (missing.length > 0 ? '<div style="margin-top:8px;padding-top:8px;border-top:2px dashed #fed7aa;">' + missingRows + '</div>' : '')
              + '</div>';

            document.body.appendChild(wrap);
        }




        function renderSummaryDash() {
            const wrap = document.getElementById('summaryDashWrap');
            if (!rawData || rawData.length === 0) {
                wrap.innerHTML = '<div style="text-align:center;padding:60px;color:#888;">⚠️ Data belum tersedia. Silakan upload data terlebih dahulu.</div>';
                return;
            }
            // Destroy semua chart sebelum rebuild HTML
            Object.keys(_summaryCharts).forEach(k => destroySummaryChart(k));
            const _ldEl = document.getElementById('loadingSummaryDash');
            if (_ldEl) _ldEl.style.display = 'none';

            // ── Aggregate totals dari bp_DEPO (MTD, BE, BP, LY, LM, L3M) ─────
            // bp_DEPO field: MTD, BE, T.BP, LY, LM, L3M
            const bpSrc = window.catBpData || [];
            let totLY=0, totLM=0, totL3M=0, totBE=0, totBP=0, totMTD=0;
            if (bpSrc.length > 0) {
                bpSrc.forEach(r => {
                    totLY  += Number(r.LY    || 0);
                    totLM  += Number(r.LM    || 0);
                    totL3M += Number(r.L3M   || 0);
                    totBE  += Number(r.BE    || 0);
                    totBP  += Number(r['T.BP'] || 0);
                    totMTD += Number(r.MTD   || 0);
                });
            } else {
                // Fallback ke rawData jika bp_DEPO belum loaded
                rawData.forEach(r => {
                    totLY  += Number(r.LY  || 0);
                    totLM  += Number(r.LM  || 0);
                    totL3M += Number(r.L3M || 0);
                    totBE  += Number(r.BE  || 0);
                    totBP  += Number(r.BP  || 0);
                    totMTD += Number(r.MTD || r.Act || 0);
                });
            }

            // Outlet CR/CA tetap dari rawData (bp_DEPO tidak punya data outlet)
            const crSet=new Set(), caSet=new Set();
            rawData.forEach(r => {
                const id = r['Id Pelanggan'] || r['ID Pelanggan'] || '';
                if (id) { crSet.add(id); if (Number(r.CA||0)>0) caSet.add(id); }
            });

            const achBE = totBE > 0 ? (totMTD/totBE*100) : 0;
            const achBP = totBP > 0 ? (totMTD/totBP*100) : 0;
            const achLY = totLY > 0 ? (totMTD/totLY*100) : 0;
            const gapBE = totMTD - totBE;
            const gapBP = totMTD - totBP;

            // ── Weekly data ────────────────────────────────────────────────────
            // Pastikan weeks dari getWeeksForMonth (tidak bergantung tab Weekly sudah dibuka)
            const _weeksCfg = getWeeksForMonth();
            if (WEEKS_CONFIG.length === 0) {
                WEEKS_CONFIG = _weeksCfg.map(w => `W${w.num}`);
                WEEKS_CONFIG.push('MTD');
            }
            const weeks = _weeksCfg;
            const wLabels=[], wMTD=[], wBE=[], wBP=[];
            weeks.forEach(w => {
                const n = String(w.num);
                let wm=0, wb=0, wbp=0;
                rawData.forEach(r => {
                    wm  += Number(r['MTDW'+n] || 0);
                    wb  += Number(r['BEW'+n]  || 0);
                    wbp += Number(r['BPW'+n]  || 0);
                });
                wLabels.push('W'+n);
                wMTD.push(wm); wBE.push(wb); wBP.push(wbp);
            });

            // ── Channel breakdown ──────────────────────────────────────────────
            const chMap={};
            rawData.forEach(r => {
                const ch=(r.Channel||r.channel||'Other').toUpperCase();
                if(!chMap[ch]) chMap[ch]={MTD:0,BE:0,BP:0};
                chMap[ch].MTD += Number(r.MTD||0);
                chMap[ch].BE  += Number(r.BE ||0);
                chMap[ch].BP  += Number(r.BP ||0);
            });
            const chOrder=['WHOLESALER','RETAIL','FS','INSTITUTION','MTI','NKA'];
            const chLabels=[],chMTD=[],chBE=[];
            chOrder.forEach(ch=>{ if(chMap[ch]){chLabels.push(ch);chMTD.push(chMap[ch].MTD);chBE.push(chMap[ch].BE);} });
            // Hanya tampilkan 6 channel di chOrder, jangan tambah channel lain

            // ── Top Principle: MTD & BP dari bp_DEPO (sama dgn Category All Salesman) ──
            const prMap={};
            (window.catBpData||[]).forEach(r=>{
                const pr=r.Principle||'Other';
                if(!prMap[pr]) prMap[pr]={MTD:0,BP:0};
                prMap[pr].MTD += Number(r.MTD    ||0);
                prMap[pr].BP  += Number(r['T.BP']||0);
            });
            const topPr = Object.entries(prMap).filter(([,v])=>v.MTD>0||v.BP>0).sort((a,b)=>b[1].BP-a[1].BP).slice(0,7);

            // ── Top Category (PwC_Grp3): sama dari bp_DEPO ──────────────────────
            const catGrMap2={};
            (window.catBpData||[]).forEach(r=>{
                const gr=r.PwC_Grp3||'Other';
                if(!catGrMap2[gr]) catGrMap2[gr]={MTD:0,BP:0};
                catGrMap2[gr].MTD += Number(r.MTD    ||0);
                catGrMap2[gr].BP  += Number(r['T.BP']||0);
            });
            const topCat = Object.entries(catGrMap2).filter(([,v])=>v.MTD>0||v.BP>0).sort((a,b)=>b[1].BP-a[1].BP).slice(0,8);

            // ── Klasemen Depo (Summary Regional) atau Semua Salesman (per Depo) ───
            const isRegional = (selectedDepo === 'data_SUMMARY');
            let topSm = [];
            if (isRegional && window._depoAchMap) {
                // Klasemen Depo — dari _depoAchMap yang sudah dihitung saat agregasi
                topSm = Object.entries(window._depoAchMap)
                    .filter(([,v])=>v.MTD>0||v.BP>0)
                    .sort((a,b)=>{
                        const achA = a[1].BP>0?a[1].MTD/a[1].BP:0;
                        const achB = b[1].BP>0?b[1].MTD/b[1].BP:0;
                        return achB - achA;
                    });
            } else {
                // Semua Salesman — dari rawData (per depo)
                const smMap={};
                rawData.forEach(r=>{
                    const sm=r['Nama Salesman']||r.Salesman||'';
                    if(!sm) return;
                    if(!smMap[sm]) smMap[sm]={MTD:0,BP:0,BE:0};
                    smMap[sm].MTD+=Number(r.MTD||0);
                    smMap[sm].BP +=Number(r.BP ||0);
                    smMap[sm].BE +=Number(r.BE ||0);
                });
                topSm = Object.entries(smMap)
                    .filter(([,v])=>v.MTD>0||v.BP>0)
                    .sort((a,b)=>{
                        const achA = a[1].BP>0?a[1].MTD/a[1].BP:0;
                        const achB = b[1].BP>0?b[1].MTD/b[1].BP:0;
                        return achB - achA;
                    });
            }

            // ── Funnel data: LY→LM→BE→BP→MTD ─────────────────────────────────
            const funnelVals = [totLY,totLM,totBE,totBP,totMTD];
            const funnelLabels = ['LY','LM','BE','BP','MTD'];
            const funnelBase = funnelVals[0]||1;

            // ── Helpers ────────────────────────────────────────────────────────
            const jt = v => { const m=v/1e6; return Math.abs(m)>=1000?m.toFixed(0).replace(/\B(?=(\d{3})+\b)/g,'.')+' jt':m.toFixed(1)+' jt'; };
            const pct = v => v.toFixed(1)+'%';
            const colAch = p => p>=100?'#16a34a':p>=90?'#ca8a04':'#dc2626';
            const bgAch  = p => p>=100?'#dcfce7':p>=90?'#fef9c3':'#fee2e2';
            const arrow  = (curr,prev) => curr>=prev
                ? '<span style="color:#16a34a;font-size:11px;">▲ '+pct(prev>0?(curr-prev)/prev*100:0)+'</span>'
                : '<span style="color:#dc2626;font-size:11px;">▼ '+pct(prev>0?(prev-curr)/prev*100:0)+'</span>';

            // ── Build HTML ─────────────────────────────────────────────────────
            const cardStyle = 'background:white;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.08);padding:14px 16px;';
            const titleStyle = 'font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;';
            const bigNum = (val,color='#1e293b') => `<div style="font-size:24px;font-weight:800;color:${color};line-height:1.1;">${val}</div>`;
            const subRow = (label,val,col='#64748b') => `<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px;"><span style="color:#94a3b8;">${label}</span><span style="color:${col};font-weight:600;">${val}</span></div>`;

            wrap.innerHTML = `
${isRegional ? renderDepoStatusPanel() : ''}
<div style="display:grid;grid-template-columns:220px 1fr 260px;gap:12px;height:calc(100vh-200px);">

  <!-- ═══ LEFT METRICS ═══ -->
  <div style="display:flex;flex-direction:column;gap:10px;">

    <!-- MTD Card -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">📦 MTD Achievement</div>
      ${bigNum(jt(totMTD),'#0e7490')}
      <div style="margin-top:6px;background:#e0f2fe;border-radius:6px;height:6px;">
        <div style="width:${Math.min(achBE,100)}%;background:#0e7490;height:6px;border-radius:6px;transition:width .5s;"></div>
      </div>
      ${subRow('vs BE', pct(achBE), colAch(achBE))}
      ${subRow('vs BP', pct(achBP), colAch(achBP))}
    </div>

    <!-- BE & BP Card -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">🎯 Target</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div style="background:#f0f9ff;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#64748b;font-weight:600;">BE</div>
          <div style="font-size:16px;font-weight:800;color:#0284c7;">${jt(totBE)}</div>
          <div style="font-size:9px;color:${gapBE>=0?'#16a34a':'#dc2626'};font-weight:600;">Gap: ${gapBE>=0?'+':''}${jt(gapBE)}</div>
        </div>
        <div style="background:#fdf4ff;border-radius:8px;padding:8px;text-align:center;">
          <div style="font-size:9px;color:#64748b;font-weight:600;">BP</div>
          <div style="font-size:16px;font-weight:800;color:#7c3aed;">${jt(totBP)}</div>
          <div style="font-size:9px;color:${gapBP>=0?'#16a34a':'#dc2626'};font-weight:600;">Gap: ${gapBP>=0?'+':''}${jt(gapBP)}</div>
        </div>
      </div>
    </div>

    <!-- Historical Card -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">📅 Historical</div>
      ${[['LY',totLY],['LM',totLM],['L3M',totL3M]].map(([lbl,val])=>{
        const diff = val>0 ? Math.abs(totMTD-val)/val*100 : 0;
        const up   = totMTD >= val;
        const col  = up ? '#16a34a' : '#dc2626';
        const arr  = up ? '▲' : '▼';
        return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-top:4px;">'
          + '<span style="color:#94a3b8;">'+lbl+'</span>'
          + '<span style="color:#1e293b;font-weight:600;">'+jt(val)+'</span>'
          + '<span style="color:'+col+';font-weight:700;font-size:10px;">'+arr+' '+(val>0?pct(diff):'—')+'</span>'
          + '</div>';
      }).join('')}
    </div>

    <!-- Outlet Card -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">🏪 CA vs CR Depo</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;text-align:center;">
        <div style="background:#f8fafc;border-radius:8px;padding:8px;">
          <div style="font-size:9px;color:#64748b;font-weight:600;">CR</div>
          <div style="font-size:18px;font-weight:800;color:#334155;">${crSet.size.toLocaleString('id-ID')}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:8px;">
          <div style="font-size:9px;color:#64748b;font-weight:600;">CA</div>
          <div style="font-size:18px;font-weight:800;color:#16a34a;">${caSet.size.toLocaleString('id-ID')}</div>
        </div>
      </div>
      ${subRow('Hit Rate', crSet.size>0?pct(caSet.size/crSet.size*100):'—', '#0e7490')}
    </div>

  </div><!-- end left -->

  <!-- ═══ CENTER CHARTS ═══ -->
  <div style="display:flex;flex-direction:column;gap:10px;">

    <!-- Toggle buttons -->
    <div style="display:flex;gap:8px;">
      <button id="sdChartBtn1" onclick="switchSummaryDashChart('weekly')"
        style="padding:6px 16px;border-radius:20px;border:2px solid #0e7490;background:#0e7490;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">
        📊 Progress Mingguan
      </button>
      <button id="sdChartBtn2" onclick="switchSummaryDashChart('daily')"
        style="padding:6px 16px;border-radius:20px;border:2px solid #0e7490;background:#fff;color:#0e7490;font-size:11px;font-weight:700;cursor:pointer;">
        📅 Trend Harian
      </button>
    </div>

    <!-- Weekly Bar Chart -->
    <div id="sdChartWeekly" style="${cardStyle}flex:1;min-height:0;">
      <div style="${titleStyle}">📊 PROGRESS PER MINGGU — ACTUAL VS BE VS BP</div>
      <div style="position:relative;height:calc(100% - 28px);min-height:140px;">
        <canvas id="summaryWeekChart"></canvas>
      </div>
    </div>

    <!-- Daily Trend Chart -->
    <div id="sdChartDaily" style="${cardStyle}flex:1;min-height:0;display:none;">
      <div style="${titleStyle}">📅 TREND HARIAN — SO / DO VS BP</div>
      <div id="sdDailyLoading" style="font-size:12px;color:#888;padding:6px 0;">⏳ Memuat data harian...</div>
      <div style="position:relative;height:calc(100% - 28px);min-height:140px;">
        <canvas id="summaryDailyChart"></canvas>
      </div>
    </div>



    <!-- Channel Radial Cards -->
    <div style="${cardStyle}padding:0;overflow:hidden;">
      <!-- Tab headers -->
      <div style="display:flex;border-bottom:2px solid #f1f5f9;">
        <button id="sdTabBtnChannel" onclick="switchSdBottomTab('channel')"
          style="flex:1;padding:8px 4px;border:none;background:#0e7490;color:white;font-size:10px;font-weight:700;cursor:pointer;border-radius:0;">
          🏬 Channel Outlet vs BE
        </button>
        <button id="sdTabBtnProses" onclick="switchSdBottomTab('proses')"
          style="flex:1;padding:8px 4px;border:none;background:white;color:#64748b;font-size:10px;font-weight:700;cursor:pointer;border-radius:0;">
          ⚙️ Produktifitas
        </button>
      </div>
      <!-- Channel tab content -->
      <div id="sdTabChannel" style="padding:10px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:8px;">
          ${(()=>{
            const chOrder=['WHOLESALER','RETAIL','FS','INSTITUTION','MTI','NKA'];
            const allCh = chOrder.filter(ch=>chMap[ch]); // Hanya tampilkan 6 channel, abaikan yang lain
            return allCh.map((ch,i)=>{
              const v=chMap[ch]; if(!v) return '';
              const achPct = v.BE>0?(v.MTD/v.BE*100):0;
              const fillDeg = Math.min(achPct,100)/100*360;
              const col = achPct>=100?'#16a34a':achPct>=90?'#ca8a04':'#dc2626';
              const conic = 'conic-gradient('+col+' 0deg '+fillDeg.toFixed(1)+'deg, #e2e8f0 '+fillDeg.toFixed(1)+'deg 360deg)';
              return '<div style="text-align:center;background:#f8fafc;border-radius:10px;padding:8px 4px;">'
                + '<div style="font-size:9px;font-weight:700;color:#475569;margin-bottom:4px;">'+ch+'</div>'
                + '<div style="position:relative;width:48px;height:48px;margin:0 auto;">'
                +   '<div style="width:48px;height:48px;border-radius:50%;background:'+conic+';"></div>'
                +   '<div style="position:absolute;inset:6px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;">'
                +     '<span style="font-size:9px;font-weight:800;color:'+col+';">'+achPct.toFixed(1)+'%</span>'
                +   '</div>'
                + '</div>'
                + '<div style="font-size:9px;font-weight:700;color:#0e7490;margin-top:3px;">'+jt(v.MTD)+'</div>'
                + '<div style="font-size:8px;color:#94a3b8;">BE '+jt(v.BE)+'</div>'
                + '</div>';
            }).join('');
          })()}
        </div>
      </div>
      <!-- Proses tab content -->
      <div id="sdTabProses" style="padding:10px;display:none;">
        <div id="sdProsesMetrics" style="font-size:11px;color:#94a3b8;">⏳ Memuat...</div>
      </div>
    </div>

  </div><!-- end center -->

  <!-- ═══ RIGHT PANEL ═══ -->
  <div style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;max-height:calc(100vh - 80px);">

    <!-- Top Principles -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">🏆 Principle Group (Vs BP)</div>
      ${topPr.map(([pr,v],i)=>{
        const clrs=['#0e7490','#0284c7','#7c3aed','#16a34a','#ca8a04','#dc2626','#ea580c'];
        const fillW = v.BP>0?Math.min(v.MTD/v.BP*100,100).toFixed(1):0;
        const ach   = v.BP>0?(v.MTD/v.BP*100).toFixed(1):0;
        const prShort = pr.length>12?pr.slice(0,11)+'…':pr;
        return '<div style="margin-bottom:7px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;margin-bottom:2px;">'
          +   '<span style="font-weight:600;color:#334155;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          +     (i+1)+'. '+prShort
          +     '<span style="font-size:8px;color:#94a3b8;font-weight:400;"> (BP '+jt(v.BP)+')</span>'
          +   '</span>'
          +   '<span style="display:flex;gap:4px;align-items:center;flex-shrink:0;margin-left:4px;">'
          +     '<span style="color:#64748b;font-size:9px;">'+jt(v.MTD)+'</span>'
          +     '<span style="background:'+bgAch(Number(ach))+';color:'+colAch(Number(ach))+';border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;">'+ach+'%</span>'
          +   '</span>'
          + '</div>'
          + '<div style="background:#e2e8f0;border-radius:4px;height:5px;">'
          +   '<div style="width:'+fillW+'%;background:'+clrs[i%clrs.length]+';height:5px;border-radius:4px;transition:width .4s;"></div>'
          + '</div>'
          + '</div>';
      }).join('')}
    </div>

    <!-- Top Category -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">📦 Top Category (Vs BP)</div>
      <div style="max-height:340px;overflow-y:auto;">
      ${topCat.map(([gr,v],i)=>{
        const clrs=['#0e7490','#0284c7','#7c3aed','#16a34a','#ca8a04','#dc2626','#ea580c','#0891b2'];
        const fillW = v.BP>0?Math.min(v.MTD/v.BP*100,100).toFixed(1):0;
        const ach   = v.BP>0?(v.MTD/v.BP*100).toFixed(1):0;
        const grShort = gr.length>12?gr.slice(0,11)+'…':gr;
        return '<div style="margin-bottom:7px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;margin-bottom:2px;">'
          +   '<span style="font-weight:600;color:#334155;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'
          +     (i+1)+'. '+grShort
          +     '<span style="font-size:8px;color:#94a3b8;font-weight:400;"> (BP '+jt(v.BP)+')</span>'
          +   '</span>'
          +   '<span style="display:flex;gap:4px;align-items:center;flex-shrink:0;margin-left:4px;">'
          +     '<span style="color:#64748b;font-size:9px;">'+jt(v.MTD)+'</span>'
          +     '<span style="background:'+bgAch(Number(ach))+';color:'+colAch(Number(ach))+';border-radius:3px;padding:1px 5px;font-size:9px;font-weight:700;">'+ach+'%</span>'
          +   '</span>'
          + '</div>'
          + '<div style="background:#e2e8f0;border-radius:4px;height:5px;">'
          +   '<div style="width:'+fillW+'%;background:'+clrs[i%clrs.length]+';height:5px;border-radius:4px;transition:width .4s;"></div>'
          + '</div>'
          + '</div>';
      }).join('')}
      </div>
    </div>

    <!-- Klasemen Depo / Semua Salesman -->
    <div style="${cardStyle}">
      <div style="${titleStyle}">${isRegional ? '🏢 Klasemen Depo (MTD vs BP)' : '👤 All Salesman (MTD vs BTI)'}</div>
      <div style="max-height:240px;overflow-y:auto;">
      ${topSm.map(([sm,v],i)=>{
        const smAch  = v.BP>0?v.MTD/v.BP*100:0;
        const smLabel = v.label || sm; // pakai label asli depo jika ada
        return '<div style="display:flex;align-items:center;gap:5px;padding:3px 0;border-bottom:1px solid #f1f5f9;font-size:10px;">'
          + '<span style="width:16px;color:#94a3b8;font-weight:600;flex-shrink:0;">'+(i+1)+'</span>'
          + '<span style="flex:1;font-weight:600;color:#334155;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">'+smLabel+'</span>'
          + '<span style="color:#0e7490;font-weight:700;white-space:nowrap;font-size:9px;">'+jt(v.MTD)+'</span>'
          + '<span style="background:'+bgAch(smAch)+';color:'+colAch(smAch)+';border-radius:3px;padding:1px 5px;font-weight:700;font-size:9px;white-space:nowrap;flex-shrink:0;">'+smAch.toFixed(1)+'%</span>'
          + '</div>';
      }).join('')}
      </div>
    </div>

  </div><!-- end right -->

</div><!-- end grid -->`;

            // ── Init float button status depo (hanya Summary Regional) ─────────
            if (isRegional) initDepoStatusFloat();

            // ── Draw Charts ────────────────────────────────────────────────────
            destroySummaryChart('week');

            // Weekly bar chart
            const weekCtx = document.getElementById('summaryWeekChart');
            // ── Weekly Chart — Variance Stream ────────────────────────────────
            if (weekCtx && wLabels.length > 0) {

                // Total = sum semua minggu
                const totMTD = wMTD.reduce((a,b)=>a+b,0);
                const totBE  = wBE.reduce((a,b)=>a+b,0);
                const totBP  = wBP.reduce((a,b)=>a+b,0);

                const allLabels = [...wLabels, 'Total'];
                const allMTD    = [...wMTD,  totMTD];
                const allBE     = [...wBE,   totBE];
                const allBP     = [...wBP,   totBP];
                
                // Format label singkat: 3.521.390.000 → "3.52 M" | 741.000.000 → "741 jt" | 0 → null (skip)
                const _fmtPt = v => {
                    if (!v || v === 0) return null;
                    const a = Math.abs(v);
                    if (a >= 1e9) return (v/1e9).toFixed(2).replace(/\.?0+$/,'') + ' M';
                    return Math.round(v/1e6) + ' jt';
                };
                
                // ── Custom plugin ───────────────────────────────────────────
                const vsPlugin = {
                    id: 'varianceStream',

                    // ── Variance fill BP vs Actual ──────────────────────────────
                    beforeDatasetsDraw(chart) {
                        const ctx = chart.ctx, area = chart.chartArea;
                        const mBP = chart.getDatasetMeta(0), mAct = chart.getDatasetMeta(2);
                        if (!mBP.data.length) return;
                        ctx.save();
                        ctx.beginPath();
                        ctx.rect(area.left, area.top, area.right-area.left, area.bottom-area.top);
                        ctx.clip();
                        for (let i = 0; i < mBP.data.length-1; i++) {
                            const x0=mBP.data[i].x, x1=mBP.data[i+1].x;
                            const b0=mBP.data[i].y, b1=mBP.data[i+1].y;
                            const a0=mAct.data[i].y, a1=mAct.data[i+1].y;
                            const d0=b0-a0, d1=b1-a1;
                            const seg = (xa,xb,bYa,bYb,aYa,aYb,neg) => {
                                ctx.beginPath();
                                ctx.moveTo(xa,bYa); ctx.lineTo(xb,bYb);
                                ctx.lineTo(xb,aYb); ctx.lineTo(xa,aYa);
                                ctx.closePath();
                                ctx.fillStyle = neg ? 'rgba(252,165,165,.35)' : 'rgba(134,239,172,.35)';
                                ctx.fill();
                            };
                            if (d0*d1 < 0) {
                                const t=d0/(d0-d1), cx=x0+t*(x1-x0), cy=b0+t*(b1-b0);
                                seg(x0,cx,b0,cy,a0,cy,d0>0);
                                seg(cx,x1,cy,b1,cy,a1,d1>0);
                            } else seg(x0,x1,b0,b1,a0,a1,d0>0);
                        }
                        ctx.restore();
                    },

                    // ── Label titik dengan background + separator Total ─────────
                    afterDatasetsDraw(chart) {
                        const ctx  = chart.ctx, area = chart.chartArea;
                        const mBP  = chart.getDatasetMeta(0);
                        const mBE  = chart.getDatasetMeta(1);
                        const mAct = chart.getDatasetMeta(2);
                        ctx.save();

                        const FS = 10;

                        function solidLabel(text, cx, cy, color) {
                            ctx.font = `bold ${FS}px Arial`;
                            ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
                            const tw = ctx.measureText(text).width;
                            const px = 5, py = 3;
                            ctx.fillStyle = color;
                            ctx.beginPath();
                            if (ctx.roundRect) ctx.roundRect(cx-tw/2-px, cy-FS/2-py, tw+px*2, FS+py*2, 4);
                            else ctx.rect(cx-tw/2-px, cy-FS/2-py, tw+px*2, FS+py*2);
                            ctx.fill();
                            ctx.fillStyle = '#fff';
                            ctx.fillText(text, cx, cy);
                        }

                        // Batas aman label (sedikit margin dari tepi chart)
                        const T = area.top    + FS + 8;
                        const B = area.bottom - FS - 8;
                        const LBL_OFF = 16;
                        const MIN_GAP = FS + 8; // 18px

                        allLabels.forEach((_, i) => {
                            const bpTxt  = _fmtPt(allBP[i]);
                            const beTxt  = _fmtPt(allBE[i]);
                            const actTxt = _fmtPt(allMTD[i]);

                            const pts = [];
                            if (bpTxt  && mBP.data[i])
                                pts.push({ cx:mBP.data[i].x,  py:mBP.data[i].y,  text:bpTxt,  color:'#7c3aed', dir:-1 });
                            if (beTxt  && mBE.data[i])
                                pts.push({ cx:mBE.data[i].x,  py:mBE.data[i].y,  text:beTxt,  color:'#ea580c', dir:-1 });
                            if (actTxt && mAct.data[i])
                                pts.push({ cx:mAct.data[i].x, py:mAct.data[i].y, text:actTxt, color:'#0e7490', dir: 1 });

                            if (!pts.length) return;

                            const LBL_OFF = 18;
                            const MIN_GAP = FS + 8;
                            // Batas: cukup longgar agar label atas tidak tertutup
                            const T = area.top    + 6;
                            const B = area.bottom - FS - 6;

                            pts.forEach(p => { p.ly = p.py + p.dir * LBL_OFF; });
                            pts.sort((a, b) => a.ly - b.ly);

                            for (let pass = 0; pass < 20; pass++) {
                                // Clamp ke batas canvas
                                pts.forEach(p => {
                                    p.ly = Math.max(T, Math.min(B, p.ly));
                                });
                                // Paksa: label atas (dir=-1) tidak boleh di bawah titiknya
                                pts.forEach(p => {
                                    if (p.dir === -1 && p.ly > p.py - 6) p.ly = p.py - 6;
                                    if (p.dir ===  1 && p.ly < p.py + 6) p.ly = p.py + 6;
                                });
                                // Push apart
                                let moved = false;
                                for (let j = 1; j < pts.length; j++) {
                                    const ov = MIN_GAP - (pts[j].ly - pts[j-1].ly);
                                    if (ov > 0.3) {
                                        pts[j-1].ly -= ov * 0.35;
                                        pts[j].ly   += ov * 0.65;
                                        moved = true;
                                    }
                                }
                                if (!moved) break;
                            }

                            pts.forEach(p => solidLabel(p.text, p.cx, p.ly, p.color));
                        });

                        // Separator Total
                        const sepL = mBP.data[allLabels.length-2];
                        const sepR = mBP.data[allLabels.length-1];
                        if (sepL && sepR) {
                            const sx = (sepL.x + sepR.x) / 2;
                            ctx.strokeStyle='#cbd5e1'; ctx.lineWidth=1; ctx.setLineDash([4,4]);
                            ctx.beginPath(); ctx.moveTo(sx, area.top); ctx.lineTo(sx, area.bottom);
                            ctx.stroke(); ctx.setLineDash([]);
                        }
                        ctx.restore();
                    },

                    // ── Gap label di bawah tick X-axis ──────────────────────────
                    afterDraw(chart) {
                        const ctx  = chart.ctx, area = chart.chartArea;
                        const mBP  = chart.getDatasetMeta(0);
                        ctx.save();
                        ctx.font         = 'bold 10px Arial';
                        ctx.textAlign    = 'center';
                        ctx.textBaseline = 'top';

                        allLabels.forEach((_, i) => {
                            const pt = mBP.data[i]; if (!pt) return;
                            const gap    = allMTD[i] - allBP[i];
                            const fmtGap = _fmtPt(Math.abs(gap));
                            if (!fmtGap) return;
                            const isPos  = gap > 0;
                            ctx.fillStyle = isPos ? '#16a34a' : '#dc2626';
                            ctx.fillText((isPos ? '+' : '-') + fmtGap, pt.x, area.bottom + 24);
                        });

                        ctx.restore();
                    }
                };

                // ── Destroy chart lama jika ada ────────────────────────────
                if (_summaryCharts.week) {
                    _summaryCharts.week.destroy();
                    _summaryCharts.week = null;
                }
                
                // ── Buat chart baru ────────────────────────────────────────
                _summaryCharts.week = new Chart(weekCtx, {
                    type: 'line',
                    data: {
                        labels: allLabels,
                        datasets: [
                            {
                                label: 'BP', data: allBP,
                                borderColor: '#7c3aed', borderWidth: 2,
                                borderDash: [6, 4],                    // ← dashed
                                pointRadius: 5, pointBackgroundColor: '#fff',
                                pointBorderColor: '#7c3aed', pointBorderWidth: 2,
                                tension: 0.35, fill: false, clip: false,
                            },
                            {
                                label: 'BE', data: allBE,
                                borderColor: '#f97316', borderWidth: 2,
                                borderDash: [6, 4],                    // ← dashed
                                pointRadius: 5, pointBackgroundColor: '#fff',
                                pointBorderColor: '#f97316', pointBorderWidth: 2,
                                tension: 0.35, fill: false, clip: false,
                            },
                            {
                                label: 'Act MTD', data: allMTD,
                                borderColor: '#0e7490', borderWidth: 2.5,
                                // tidak dashed
                                pointRadius: 5, pointBackgroundColor: '#fff',
                                pointBorderColor: '#0e7490', pointBorderWidth: 2,
                                tension: 0.35, fill: false, clip: false,
                            },
                        ]
                    },
                    options: {
                        responsive          : true,
                        maintainAspectRatio : false,
                        layout: { padding: { top: 2, bottom: 22, left: 2, right: 46 } },
                        interaction: { mode:'index', intersect:false },
                        plugins: {
                            legend: {
                                labels: {
                                    color          : '#374151',   // ← teks selalu gelap
                                    font           : { size: 11 },
                                    padding        : 12,
                                    usePointStyle  : true,
                                    pointStyleWidth: 20,
                                    generateLabels(chart) {
                                        return chart.data.datasets.map((ds, i) => ({
                                            text        : ds.label,
                                            strokeStyle : ds.borderColor,
                                            fillStyle   : ds.borderColor,
                                            lineDash    : ds.borderDash || [],
                                            lineWidth   : ds.borderWidth || 2,
                                            pointStyle  : 'line',
                                            color       : '#374151',   // ← wajib di sini juga
                                            fontColor   : '#374151',   // ← fallback untuk Chart.js versi lama
                                            hidden      : !chart.isDatasetVisible(i),
                                            datasetIndex: i,
                                        }));
                                    }
                                }
                            },
                            tooltip: { callbacks:{ label: c => ` ${c.dataset.label}: ${jt(c.raw)}` } }
                        },
                        scales: {
                            y: {
                                ticks: { callback: v => jt(v), font:{size:9}, stepSize: 250e6 },
                                grid : { color:'#f1f5f9' },
                                title: { display:true, text:'Nilai (jt)', font:{size:9}, color:'#94a3b8' }
                            },
                            x: {
                                ticks: { font:{size:10}, padding:2 },
                                grid : { color:'#f1f5f9' }
                            }
                        }
                    },
                    plugins: [vsPlugin]
                });
            }

            // ── Load daily chart async (non-blocking) ─────────────────────────
            const _sdSuffix  = selectedDepo.replace(/^data_DEPO_/i, '');
            const _isRegional = (selectedDepo === 'data_SUMMARY');
            destroySummaryChart('daily');
            (async () => {
                const loadEl = document.getElementById('sdDailyLoading');
                try {
                    // ── SUMMARY REGIONAL: agregasi dari semua trend_DEPO_*.json ──
                    if (_isRegional) {
                        const cacheKey = '_regional_';
                        if (!window._trendDailyData || window._trendDailyData._depo !== cacheKey) {
                            if (loadEl) { loadEl.style.display=''; loadEl.textContent='⏳ Memuat trend semua depo...'; }

                            // Ambil daftar depo
                            let depoSuffixes = [];
                            try {
                                const dlRes = await fetch('depo_list.json');
                                if (dlRes.ok) {
                                    const dl = await dlRes.json();
                                    depoSuffixes = (dl.depos || []).map(d =>
                                        d.trim().toUpperCase().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_')
                                    );
                                }
                            } catch(e) { console.warn('depo_list.json error:', e); }

                            // Fetch semua trend_DEPO_*.json secara paralel
                            const trendFetches = await Promise.all(depoSuffixes.map(async sfx => {
                                try {
                                    const r = await fetch('trend_DEPO_' + sfx + '.json');
                                    if (!r.ok) return null;
                                    const j = await r.json();
                                    return { daily: j.daily || [], weekly: j.weekly || j.data || [] };
                                } catch(e) { return null; }
                            }));

                            // Agregasi daily: group by Date, sum SO/DO/BP
                            const dailyMap = {};
                            trendFetches.forEach(td => {
                                if (!td) return;
                                (td.daily || []).forEach(r => {
                                    const dt = r.Date || '';
                                    if (!dt) return;
                                    if (!dailyMap[dt]) dailyMap[dt] = { Date: dt, SO: 0, DO: 0, BP: 0 };
                                    dailyMap[dt].SO += Number(r.SO || 0);
                                    dailyMap[dt].DO += Number(r.DO || 0);
                                    dailyMap[dt].BP += Number(r.BP || 0);
                                });
                            });
                            // Sort by date (format DD/MM/YYYY)
                            const parseDt = s => {
                                const p = (s||'').split('/');
                                return p.length === 3 ? new Date(+p[2], +p[1]-1, +p[0]) : new Date(0);
                            };
                            const aggDaily = Object.values(dailyMap).sort((a,b) => parseDt(a.Date) - parseDt(b.Date));

                            // Agregasi weekly: gabungkan semua records (renderTrendChart akan reaggregasi)
                            const aggWeekly = [];
                            trendFetches.forEach(td => {
                                if (!td) return;
                                (td.weekly || []).forEach(r => aggWeekly.push(r));
                            });

                            window._trendDailyData       = aggDaily;
                            window._trendDailyData._depo = cacheKey;
                            window._trendWeeklyData      = aggWeekly;
                        }
                    } else {
                        // ── PER-DEPO: fetch satu file ──────────────────────────────
                        if (!window._trendDailyData || window._trendDailyData._depo !== _sdSuffix) {
                            const res = await fetch('trend_DEPO_' + _sdSuffix + '.json');
                            if (!res.ok) throw new Error('trend_DEPO_' + _sdSuffix + '.json tidak ditemukan');
                            const json = await res.json();
                            window._trendDailyData       = json.daily  || [];
                            window._trendDailyData._depo = _sdSuffix;
                            window._trendWeeklyData      = json.weekly || [];
                        }
                    }
                    const dData = window._trendDailyData;
                    if (loadEl) loadEl.style.display = 'none';
                    if (!dData.length) throw new Error('data harian kosong');

                    const dailyCtx = document.getElementById('summaryDailyChart');
                    if (!dailyCtx) return;
                    const fmtDay = s => { const p=(s||'').split('/'); return p.length===3?parseInt(p[1])+'/'+parseInt(p[0]):s; };
                    const fullDates = dData.map(r => r.Date || '');
                    _summaryCharts.daily = new Chart(dailyCtx, {
                        type:'line',
                        data:{ labels:dData.map(r=>fmtDay(r.Date)), datasets:[
                            { label:'SO', data:dData.map(r=>Number(r.SO||0)), borderColor:'#0e7490', backgroundColor:'rgba(14,116,144,0.10)', borderWidth:2.5, pointRadius:4, fill:true, tension:0.3 },
                            { label:'DO', data:dData.map(r=>Number(r.DO||0)), borderColor:'#16a34a', backgroundColor:'rgba(22,163,74,0.08)', borderWidth:2, pointRadius:3, fill:true, tension:0.3 },
                            { label:'BP', data:dData.map(r=>Number(r.BP||0)), borderColor:'#f97316', backgroundColor:'transparent', borderWidth:2, borderDash:[6,4], pointRadius:3, fill:false, tension:0.3 }
                        ]},
                        options:{ responsive:true, maintainAspectRatio:false,
                            interaction:{mode:'index',intersect:false},
                            plugins:{ legend:{labels:{font:{size:10},boxWidth:14}},
                                tooltip:{callbacks:{ title:items=>fullDates[items[0].dataIndex]||items[0].label, label:ctx=>' '+ctx.dataset.label+': '+jt(ctx.raw) }}},
                            scales:{ y:{ticks:{callback:v=>jt(v),font:{size:9}},grid:{color:'#f1f5f9'}}, x:{ticks:{font:{size:10}}} }
                        }
                    });
                } catch(e) {
                    if (loadEl) { loadEl.style.display=''; loadEl.textContent='⚠️ '+e.message; }
                }
            })();
        }

        // ── Toggle Progress Mingguan ↔ Trend Harian ──────────────────────────
        window._sdChartView = 'weekly';
        function switchSummaryDashChart(type) {
            const isWeekly = type === 'weekly';
            const wEl = document.getElementById('sdChartWeekly');
            const dEl = document.getElementById('sdChartDaily');
            if (wEl) wEl.style.display = isWeekly ? '' : 'none';
            if (dEl) dEl.style.display  = isWeekly ? 'none' : '';

            const btn1 = document.getElementById('sdChartBtn1');
            const btn2 = document.getElementById('sdChartBtn2');
            if (btn1) {
                btn1.style.background = isWeekly ? '#0e7490' : '#fff';
                btn1.style.color      = isWeekly ? '#fff'    : '#0e7490';
            }
            if (btn2) {
                btn2.style.background = isWeekly ? '#fff'    : '#0e7490';
                btn2.style.color      = isWeekly ? '#0e7490' : '#fff';
            }
        }

        function switchSdBottomTab(tab) {
            const isChannel = tab === 'channel';
            document.getElementById('sdTabChannel').style.display = isChannel ? '' : 'none';
            document.getElementById('sdTabProses').style.display  = isChannel ? 'none' : '';
            const btnCh = document.getElementById('sdTabBtnChannel');
            const btnPr = document.getElementById('sdTabBtnProses');
            if (btnCh) { btnCh.style.background = isChannel ? '#0e7490' : 'white'; btnCh.style.color = isChannel ? 'white' : '#64748b'; }
            if (btnPr) { btnPr.style.background = isChannel ? 'white' : '#0e7490'; btnPr.style.color = isChannel ? '#64748b' : 'white'; }
            if (!isChannel && !window._prosesLoaded) loadProsesData();
        }

        async function loadProsesData() {
            const wrap = document.getElementById('sdProsesMetrics');
            if (!wrap) return;
            window._prosesLoaded = true;

            try {
                const isRegional = (selectedDepo === 'data_SUMMARY');
                let rows = null;

                if (isRegional) {
                    // Fetch semua proses per depo dari depo_list.json
                    wrap.innerHTML = '<span style="color:#94a3b8;font-size:11px;">⏳ Memuat data proses semua depo...</span>';
                    const depoRes = await fetch('depo_list.json');
                    const depoData = await depoRes.json();
                    const depoNames = depoData.depos || [];

                    // Fetch semua file proses secara paralel
                    const results = await Promise.all(depoNames.map(async depo => {
                        const suffix = depo.toUpperCase().trim().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_');
                        const depoLabel = depo.trim().replace(/^DEPO\s+/i,'');
                        try {
                            const r = await fetch('proses_DEPO_' + suffix + '.json');
                            if (!r.ok) return null;
                            const j = await r.json();
                            // Tag setiap row dengan nama depo
                            return (j.data || []).map(row => ({ ...row, _depoLabel: depoLabel }));
                        } catch(e) { return null; }
                    }));

                    // Gabungkan semua rows, hitung avg per depo
                    const depoMap = {};
                    results.forEach(depoRows => {
                        if (!depoRows || !depoRows.length) return;
                        const label = depoRows[0]._depoLabel;
                        if (!depoMap[label]) depoMap[label] = [];
                        depoMap[label].push(...depoRows);
                    });

                    // Buat rows summary per depo (avg % cols, sum CR/GS)
                    const pctKeys = ['%CR','%CA','%PC','%AC','%EC','%ECIns','%SKU','%GS','ARColl'];
                    const avgKey  = key => { const vals = []; return (arr) => { const v = arr.map(r=>r[key]).filter(v=>v!=null&&!isNaN(v)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; }; };
                    const avgFns  = Object.fromEntries(pctKeys.map(k=>[k, arr=>{ const v=arr.map(r=>r[k]).filter(v=>v!=null&&!isNaN(v)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; }]));

                    rows = Object.entries(depoMap).map(([label, arr]) => {
                        const r = { szname: label, 'Tipe Salesman': label, _isDepoSummary: true, _count: arr.length };
                        pctKeys.forEach(k => { r[k] = avgFns[k](arr); });
                        return r;
                    });

                    // Tampilkan sebagai tabel per depo
                    const colFn  = v => v==null?'#94a3b8':v>=1.0?'#16a34a':v>=0.85?'#ca8a04':'#dc2626';
                    const bgFn   = v => v==null?'#f8fafc':v>=1.0?'#dcfce7':v>=0.85?'#fef9c3':'#fee2e2';
                    const pctFmt = v => v==null?'—':(v*100).toFixed(1)+'%';
                    const dot    = v => '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+colFn(v)+';margin-right:2px;vertical-align:middle;"></span>';
                    const thS    = 'padding:4px 3px;font-size:8px;font-weight:700;color:white;background:#0e7490;text-align:center;';
                    const thL2   = 'padding:4px 6px;font-size:8px;font-weight:700;color:white;background:#0e7490;text-align:left;';
                    const tdS2   = v => 'padding:3px 3px;font-size:9px;font-weight:700;text-align:center;background:'+bgFn(v)+';';
                    const tdL2   = 'padding:3px 6px;font-size:9px;font-weight:600;color:#334155;';
                    const cols   = [{key:'%CR',lbl:'%CR'},{key:'%CA',lbl:'%CA'},{key:'%PC',lbl:'%PC'},{key:'%AC',lbl:'%AC'},{key:'%EC',lbl:'%EC'},{key:'%ECIns',lbl:'%ECIns'},{key:'%SKU',lbl:'%SKU'},{key:'%GS',lbl:'%GS'},{key:'ARColl',lbl:'ARColl'}];

                    let tHtml = '<div style="font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Avg % per Depo ('+rows.length+' Depo)</div>';
                    tHtml += '<table style="width:100%;border-collapse:collapse;table-layout:auto;min-width:400px;">';
                    tHtml += '<thead><tr><th style="'+thL2+'">Nama Depo</th><th style="'+thS+'">#Sls</th>';
                    cols.forEach(c=>{ tHtml+='<th style="'+thS+'">'+c.lbl+'</th>'; });
                    tHtml += '</tr></thead><tbody>';
                    rows.sort((a,b)=>a.szname.localeCompare(b.szname)).forEach((r,i)=>{
                        const bg=i%2===0?'#ffffff':'#f8fafc';
                        tHtml+='<tr style="background:'+bg+';">';
                        tHtml+='<td style="'+tdL2+'">'+r.szname+'</td>';
                        tHtml+='<td style="'+tdL2+'text-align:center;color:#0e7490;font-weight:700;">'+r._count+'</td>';
                        cols.forEach(c=>{ tHtml+='<td style="'+tdS2(r[c.key])+'">'+dot(r[c.key])+pctFmt(r[c.key])+'</td>'; });
                        tHtml+='</tr>';
                    });
                    // Baris Total Region
                    const totalSls = rows.reduce((s,r)=>s+r._count,0);
                    tHtml+='<tr style="background:#e0f2fe;border-top:2px solid #0e7490;">';
                    tHtml+='<td style="'+tdL2+'font-weight:800;color:#0e7490;">TOTAL REGION</td>';
                    tHtml+='<td style="'+tdL2+'text-align:center;font-weight:800;color:#0e7490;">'+totalSls+'</td>';
                    cols.forEach(c=>{
                        const vals=rows.map(r=>r[c.key]).filter(v=>v!=null&&!isNaN(v));
                        const v=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                        tHtml+='<td style="'+tdS2(v)+'font-weight:800;">'+dot(v)+pctFmt(v)+'</td>';
                    });
                    tHtml+='</tr>';
                    tHtml += '</tbody></table>';
                    wrap.innerHTML = tHtml;
                    return;
                }

                // Per-depo biasa
                const depoSuffix = (selectedDepo || '')
                                    .replace(/^data_DEPO_/i, '')
                                    .trim()
                                    .toUpperCase()
                                    .replace(/\s+/g, '_');
                const res = await fetch('proses_DEPO_' + depoSuffix + '.json');
                    if (!res.ok) throw new Error('not found');
                    const json = await res.json();
                    rows = json.data || [];
                if (!rows || !rows.length) { wrap.innerHTML = '<span style="color:#94a3b8;">Tidak ada data Proses.</span>'; return; }

                // Kolom % yang ditampilkan sebagai donut
                const pctCols = [
                    { key: '%CR',    label: 'CR',     desc: 'Call Rate' },
                    { key: '%CA',    label: 'CA',     desc: 'Call Achievement' },
                    { key: '%PC',    label: 'PC',     desc: 'Productive Call' },
                    { key: '%AC',    label: 'AC',     desc: 'Active Call' },
                    { key: '%EC',    label: 'EC',     desc: 'Effective Call' },
                    { key: '%ECIns', label: 'ECIns',  desc: 'EC Insentif' },
                    { key: '%SKU',   label: 'AvgSKU', desc: 'Avg SKU' },
                    { key: '%GS',    label: 'GS',     desc: 'Green Store' },
                    { key: 'ARColl', label: 'ARColl', desc: 'AR Collection', isAR: true },
                ];

                // Hitung rata-rata per kolom
                const avgPct = {};
                pctCols.forEach(c => {
                    const vals = rows.map(r => r[c.key]).filter(v => v != null && !isNaN(v));
                    avgPct[c.key] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                });

                const colFn = v => {
                    if (v == null) return '#94a3b8';
                    return v >= 1.0 ? '#16a34a' : v >= 0.85 ? '#ca8a04' : '#dc2626';
                };

                // Helper donut item — sama persis dengan Channel tab
                const donutItem = (label, v) => {
                    const achPct   = v != null ? v * 100 : 0;
                    const fillDeg  = Math.min(achPct, 100) / 100 * 360;
                    const col      = colFn(v);
                    const conic    = 'conic-gradient(' + col + ' 0deg ' + fillDeg.toFixed(1) + 'deg, #e2e8f0 ' + fillDeg.toFixed(1) + 'deg 360deg)';
                    const dispPct  = v == null ? '—' : achPct.toFixed(1) + '%';
                    return '<div style="text-align:center;background:#f8fafc;border-radius:10px;padding:8px 4px;">'
                        + '<div style="font-size:9px;font-weight:700;color:#475569;margin-bottom:4px;">' + label + '</div>'
                        + '<div style="position:relative;width:48px;height:48px;margin:0 auto;">'
                        +   '<div style="width:48px;height:48px;border-radius:50%;background:' + conic + ';"></div>'
                        +   '<div style="position:absolute;inset:6px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;">'
                        +     '<span style="font-size:9px;font-weight:800;color:' + col + ';">' + dispPct + '</span>'
                        +   '</div>'
                        + '</div>'
                        + ''
                        + '</div>';
                };

                let html = '<div style="margin-bottom:6px;font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;">Avg % Depo (' + rows.length + ' Salesman)</div>';
                // Bagi ke baris maks 9 per baris
                const chunkSize = 9;
                for (let i = 0; i < pctCols.length; i += chunkSize) {
                    const chunk = pctCols.slice(i, i + chunkSize);
                    html += '<div style="display:grid;grid-template-columns:repeat(' + chunk.length + ',1fr);gap:5px;margin-bottom:5px;">';
                    chunk.forEach(c => { html += donutItem(c.label, avgPct[c.key]); });
                    html += '</div>';
                }

                wrap.innerHTML = html;
            } catch(e) {
                wrap.innerHTML = '<span style="color:#94a3b8;font-size:11px;">⚠️ File proses_DEPO_' + (selectedDepo||'').replace(/^data_DEPO_/i,'').trim().toUpperCase().replace(/\s+/g,'_') + '.json tidak ditemukan.</span>';
            }
        }

        // ===== SALESMAN SUB-TAB: CHANNEL / PROSES =====
        function switchSalesmanSubTab(tab) {
            const isChannel = tab === 'channel';
            document.getElementById('smSubTabChannel').classList.toggle('active', isChannel);
            document.getElementById('smSubTabProses').classList.toggle('active', !isChannel);
            document.getElementById('smSubBtnChannel').classList.toggle('active', isChannel);
            document.getElementById('smSubBtnProses').classList.toggle('active', !isChannel);
            if (!isChannel) {
                // Reload jika belum load ATAU jika mode berubah (regional vs per-depo)
                const isRegional = (selectedDepo === 'data_SUMMARY');
                const wasRegional = window._smProsesWasRegional;
                if (!window._smProsesLoaded || wasRegional !== isRegional) {
                    window._smProsesLoaded = false;
                    window._smProsesRows = null;
                    window._smProsesWasRegional = isRegional;
                    loadSmProsesData();
                }
            }
        }

        // Shared proses cols
        const _smProsesCols = [
            { key: 'ARColl', label: 'ARColl' },
            { key: '%CR',    label: '%CR'    },
            { key: '%CA',    label: '%CA'    },
            { key: '%PC',    label: '%PC'    },
            { key: '%AC',    label: '%AC'    },
            { key: '%EC',    label: '%EC'    },
            { key: '%ECIns', label: '%ECIns' },
            { key: '%SKU',   label: '%SKU'   },
            { key: '%GS',    label: '%GS'    },
        ];

        function _prosesColFn(v) {
            if (v == null) return '#cbd5e1';
            return v >= 1.0 ? '#16a34a' : v >= 0.85 ? '#f59e0b' : '#ef4444';
        }

        function _buildProsesChart(canvasId, placeholderId, _unused, values) {
            const placeholder = document.getElementById(placeholderId);
            const canvas      = document.getElementById(canvasId);

            if (!values) {
                if (placeholder) placeholder.style.display = '';
                if (canvas) canvas.style.display = 'none';
                return;
            }
            if (placeholder) placeholder.style.display = 'none';
            if (canvas) canvas.style.display = '';

            if (window['_chart_' + canvasId]) { window['_chart_' + canvasId].destroy(); }

            const rawVals = _smProsesCols.map(c => values[c.key] != null ? values[c.key] : null);
            const colors  = rawVals.map(v => _prosesColFn(v));
            const labels  = _smProsesCols.map(c => c.label);
            const dispPct = rawVals.map(v => v != null ? (v * 100).toFixed(1) + '%' : '—');

            window['_chart_' + canvasId] = new Chart(canvas, {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: _smProsesCols.map(() => 1),
                        backgroundColor: colors,
                        borderColor: 'white',
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    layout: { padding: 44 },
                    cutout: '42%',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: ctx => ' ' + ctx.label + ': ' + dispPct[ctx.dataIndex]
                            }
                        }
                    }
                },
                plugins: [{
                    id: 'prosesLabels',
                    afterDraw(chart) {
                        const ctx  = chart.ctx;
                        const meta = chart.getDatasetMeta(0);

                        ctx.save();
                        meta.data.forEach((arc, i) => {
                            const mid = (arc.startAngle + arc.endAngle) / 2;
                            const r   = arc.outerRadius + 16;
                            const x   = arc.x + r * Math.cos(mid);
                            const y   = arc.y + r * Math.sin(mid);
                            const cos = Math.cos(mid);

                            ctx.textAlign    = cos > 0.15 ? 'left' : cos < -0.15 ? 'right' : 'center';
                            ctx.textBaseline = 'middle';

                            ctx.font      = 'bold 9px Arial';
                            ctx.fillStyle = '#374151';
                            ctx.fillText(labels[i], x, y - 6);

                            ctx.font      = '9px Arial';
                            ctx.fillStyle = colors[i];
                            ctx.fillText(dispPct[i], x, y + 6);
                        });
                        ctx.restore();
                    }
                }]
            });
        }


        async function loadSmProsesData() {
            window._smProsesLoaded = true;
            const tipeWrap  = document.getElementById('smProsesTipeWrap');
            const smSel     = document.getElementById('smProsesSalesmanSelect');
            const tipeTitle = document.getElementById('smProsesTipeTitle');
            const smTitle   = document.getElementById('smProsesSmTitle');
            const isRegional = (selectedDepo === 'data_SUMMARY');

            if (tipeTitle) tipeTitle.textContent = isRegional ? 'By Nama Depo' : 'By Tipe Salesman';
            if (smTitle)   smTitle.textContent   = isRegional ? 'By Nama Depo (Detail)' : 'By Nama Salesman';

            try {
                // ── REGIONAL: fetch semua proses per depo ────────────────────
                if (isRegional) {
                    tipeWrap.innerHTML = '<span style="padding:12px;display:block;color:#94a3b8;font-size:11px;">⏳ Memuat data semua depo...</span>';
                    const depoRes  = await fetch('depo_list.json');
                    const depoData = await depoRes.json();
                    const results  = await Promise.all((depoData.depos||[]).map(async depo => {
                        const suffix = depo.toUpperCase().trim().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_');
                        const label  = depo.trim().replace(/^DEPO\s+/i,'');
                        try {
                            const r = await fetch('proses_DEPO_' + suffix + '.json');
                            if (!r.ok) return null;
                            const j = await r.json();
                            return { label, data: j.data||[] };
                        } catch(e) { return null; }
                    }));

                    const depoMap = {};
                    results.forEach(d => { if (!d||!d.data.length) return; depoMap[d.label]=d.data; });
                    window._smProsesDepoMap = depoMap;

                    const pctKeys = ['%CR','%CA','%PC','%AC','%EC','%ECIns','%SKU','%GS','ARColl'];
                    const avgArr  = (arr,k) => { const v=arr.map(r=>r[k]).filter(v=>v!=null&&!isNaN(v)); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; };
                    const synRows = Object.entries(depoMap).map(([label,arr]) => {
                        const r = { szname: label, _count: arr.length };
                        pctKeys.forEach(k => { r[k] = avgArr(arr,k); });
                        return r;
                    });
                    window._smProsesRows = synRows;

                    // Populate dropdown depo
                    smSel.innerHTML = '<option value="">-- Pilih Depo --</option>';
                    Object.keys(depoMap).sort().forEach(label => {
                        const opt = document.createElement('option');
                        opt.value = label; opt.textContent = label + ' (' + depoMap[label].length + ' sls)';
                        smSel.appendChild(opt);
                    });

                    // Build tabel by depo
                    const colFn  = v => v==null?'#94a3b8':v>=1.0?'#16a34a':v>=0.85?'#f59e0b':'#ef4444';
                    const bgFn   = v => v==null?'transparent':v>=1.0?'#dcfce7':v>=0.85?'#fef9c3':'#fee2e2';
                    const pctFmt = v => v==null?'—':(v*100).toFixed(0)+'%';
                    const dot    = v => '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+colFn(v)+';margin-right:3px;vertical-align:middle;"></span>';
                    const thS = 'padding:4px 2px;font-size:8px;font-weight:700;color:white;background:#0e7490;text-align:center;position:sticky;top:0;z-index:1;';
                    const thL = 'padding:4px 6px;font-size:8px;font-weight:700;color:white;background:#0e7490;text-align:left;position:sticky;top:0;z-index:1;';
                    const tdS = v => 'padding:3px 2px;font-size:9px;font-weight:700;text-align:center;background:'+bgFn(v)+';';
                    const tdL = 'padding:3px 6px;font-size:9px;font-weight:600;color:#334155;text-align:left;';
                    const cols = _smProsesCols;

                    let html = '<table style="width:100%;border-collapse:collapse;table-layout:auto;min-width:400px;">';
                    html += '<thead><tr><th style="'+thL+'">Nama Depo</th><th style="'+thS+'">#Sls</th>';
                    cols.forEach(c=>{ html+='<th style="'+thS+'">'+c.label+'</th>'; });
                    html += '</tr></thead><tbody>';
                    synRows.sort((a,b)=>a.szname.localeCompare(b.szname)).forEach((r,i)=>{
                        const bg=i%2===0?'#ffffff':'#f8fafc';
                        html+='<tr style="background:'+bg+';">';
                        html+='<td style="'+tdL+'">'+r.szname+'</td>';
                        html+='<td style="'+tdL+'text-align:center;color:#0e7490;font-weight:700;">'+r._count+'</td>';
                        cols.forEach(c=>{ html+='<td style="'+tdS(r[c.key])+'">'+dot(r[c.key])+pctFmt(r[c.key])+'</td>'; });
                        html+='</tr>';
                    });
                    // Total Region
                    const totalSls = synRows.reduce((s,r)=>s+r._count,0);
                    html+='<tr style="background:#e0f2fe;border-top:2px solid #0e7490;">';
                    html+='<td style="'+tdL+'font-weight:800;color:#0e7490;">TOTAL REGION</td>';
                    html+='<td style="'+tdL+'text-align:center;font-weight:800;color:#0e7490;">'+totalSls+'</td>';
                    cols.forEach(c=>{
                        const vals=synRows.map(r=>r[c.key]).filter(v=>v!=null&&!isNaN(v));
                        const v=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null;
                        html+='<td style="'+tdS(v)+'font-weight:800;">'+dot(v)+pctFmt(v)+'</td>';
                    });
                    html+='</tr></tbody></table>';
                    tipeWrap.innerHTML = html;
                    return;
                }

                // ── PER-DEPO: fetch satu file proses ────────────────────────
                const depoSuffix = (selectedDepo||'').replace(/^data_DEPO_/i,'').trim().toUpperCase().replace(/\s+/g,'_');
                const res = await fetch('proses_DEPO_' + depoSuffix + '.json');
                if (!res.ok) throw new Error('not found');
                const json = await res.json();
                const rows = json.data || [];
                if (!rows.length) { tipeWrap.innerHTML='<span style="padding:12px;color:#94a3b8;">Tidak ada data.</span>'; return; }

                window._smProsesRows = rows;

                // Populate salesman select
                smSel.innerHTML = '<option value="">-- Pilih Salesman --</option>';
                rows.forEach(r => {
                    const nm = r.szname || r['Nama Salesman'] || '';
                    if (!nm) return;
                    const opt = document.createElement('option');
                    opt.value = nm; opt.textContent = nm;
                    smSel.appendChild(opt);
                });

                // ── Render "By Tipe Salesman" table in tipeWrap ─────────────
                {
                    const colFn  = v => v==null?'#94a3b8':v>=1.0?'#16a34a':v>=0.85?'#f59e0b':'#ef4444';
                    const bgFn   = v => v==null?'transparent':v>=1.0?'#dcfce7':v>=0.85?'#fef9c3':'#fee2e2';
                    const pctFmt = v => v==null?'—':(v*100).toFixed(1)+'%';
                    const dot    = v => '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+colFn(v)+';margin-right:3px;vertical-align:middle;"></span>';
                    const thS = 'padding:4px 2px;font-size:8px;font-weight:700;color:white;background:#1d3a8a;text-align:center;position:sticky;top:0;z-index:1;';
                    const thL = 'padding:4px 6px;font-size:8px;font-weight:700;color:white;background:#1d3a8a;text-align:left;position:sticky;top:0;z-index:1;';
                    const tdS = v => 'padding:3px 2px;font-size:9px;font-weight:700;text-align:center;background:'+bgFn(v)+';';
                    const tdL = 'padding:3px 6px;font-size:9px;font-weight:600;color:#334155;text-align:left;';
                    const cols = _smProsesCols;

                    // Group rows by tipe, fallback to salesmanToTipe map
                    const tipeMap = {};
                    rows.forEach(r => {
                        const nm   = r.szname || r['Nama Salesman'] || '';
                        const tipe = r.Tim || r['Tim'] || r['Tipe Sales'] || r['Tipe'] || r['tipe']
                                     || (window.salesmanToTipe && window.salesmanToTipe[nm])
                                     || 'Lainnya';
                        if (!tipeMap[tipe]) tipeMap[tipe] = [];
                        tipeMap[tipe].push(r);
                    });

                    // Build avg row per tipe
                    const tipeRows = Object.entries(tipeMap).map(([tipe, arr]) => {
                        const r = { szname: tipe, _count: arr.length };
                        cols.forEach(c => {
                            const vals = arr.map(x => x[c.key]).filter(v => v != null && !isNaN(v));
                            r[c.key] = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                        });
                        return r;
                    }).sort((a,b) => a.szname.localeCompare(b.szname));

                    let html = '<table style="width:100%;border-collapse:collapse;table-layout:auto;min-width:320px;">';
                    html += '<thead><tr><th style="'+thL+'">Tipe Salesman</th><th style="'+thS+'">#Sls</th>';
                    cols.forEach(c => { html += '<th style="'+thS+'">'+c.label+'</th>'; });
                    html += '</tr></thead><tbody>';
                    tipeRows.forEach((r, i) => {
                        const bg = i%2===0?'#ffffff':'#f8fafc';
                        html += '<tr style="background:'+bg+';">';
                        html += '<td style="'+tdL+'">'+r.szname+'</td>';
                        html += '<td style="'+tdL+'text-align:center;color:#1d3a8a;font-weight:700;">'+r._count+'</td>';
                        cols.forEach(c => { html += '<td style="'+tdS(r[c.key])+'">'+dot(r[c.key])+pctFmt(r[c.key])+'</td>'; });
                        html += '</tr>';
                    });
                    // Total Depo row
                    html += '<tr style="background:#e0f2fe;border-top:2px solid #1d3a8a;">';
                    html += '<td style="'+tdL+'font-weight:800;color:#1d3a8a;">TOTAL DEPO</td>';
                    html += '<td style="'+tdL+'text-align:center;font-weight:800;color:#1d3a8a;">'+rows.length+'</td>';
                    cols.forEach(c => {
                        const vals = rows.map(r => r[c.key]).filter(v => v != null && !isNaN(v));
                        const v = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
                        html += '<td style="'+tdS(v)+'font-weight:800;">'+dot(v)+pctFmt(v)+'</td>';
                    });
                    html += '</tr></tbody></table>';
                    tipeWrap.innerHTML = html;
                }

            } catch(e) {
                tipeWrap.innerHTML = '<span style="padding:12px;display:block;color:#94a3b8;font-size:11px;">⚠️ File proses tidak ditemukan.</span>';
            }
        }

        function renderSmProsesTipeChart() { /* unused */ }

        function renderSmProsesDonut() {
            const sel    = document.getElementById('smProsesSalesmanSelect');
            const smName = sel.value;
            const rows   = window._smProsesRows || [];
            if (!smName) { _buildProsesChart('smProsesSmChart','smProsesSmPlaceholder',null,null); return; }
            const row = rows.find(r => (r.szname || r['Nama Salesman'] || '') === smName);
            if (!row) return;
            _buildProsesChart('smProsesSmChart','smProsesSmPlaceholder',null, row);
        }


        function toggleWeekCols(wNum) {
            if (!window._wkColsState) window._wkColsState = {};
            const isHidden = !window._wkColsState[wNum];
            window._wkColsState[wNum] = isHidden;

            // Toggle TD cells with matching data-w
            document.querySelectorAll(`td.wk-detail[data-w="${wNum}"]`).forEach(el => {
                el.classList.toggle('wk-hidden', isHidden);
            });
            // Toggle TH sub-header cells for this week
            document.querySelectorAll(`th.wk-detail[data-col][class*=" w${wNum} "], th.wk-detail[data-col]`).forEach(el => {
                // Match only cells that belong to this week class
            });
            // More reliable: toggle sub-header TH with week class wN
            ['tableHeaderWeekly','tableHeaderSalesman','tableHeaderSummaryDepo','tableHeaderSummaryTipe'].forEach(id => {
                const hdr = document.getElementById(id);
                if (!hdr) return;
                hdr.querySelectorAll(`th.w${wNum}.wk-detail`).forEach(el => {
                    el.classList.toggle('wk-hidden', isHidden);
                });
                // Update colspan of the week group TH
                const grpTh = hdr.querySelector(`th[data-week="${wNum}"]`);
                if (grpTh) {
                    grpTh.setAttribute('colspan', isHidden
                        ? parseInt(grpTh.dataset.small || 4)
                        : parseInt(grpTh.dataset.full  || 9));
                }
                // Update button text
                hdr.querySelectorAll(`.wk-per-btn[data-wnum="${wNum}"]`).forEach(btn => {
                    btn.textContent = isHidden ? '+' : '−';
                    btn.classList.toggle('collapsed', isHidden);
                });
            });
        }

        // Global toggle all weeks at once
        let wkDetailVisible = true;

        function toggleWeekDetail() {
            wkDetailVisible = !wkDetailVisible;
            // Get all week numbers from config
            const weekNums = (WEEKS_CONFIG || []).filter(w => w !== 'MTD').map(w => w.replace('W',''));
            weekNums.forEach(n => {
                if (!window._wkColsState) window._wkColsState = {};
                window._wkColsState[n] = !wkDetailVisible;
                document.querySelectorAll(`td.wk-detail[data-w="${n}"]`).forEach(el => {
                    el.classList.toggle('wk-hidden', !wkDetailVisible);
                });
                ['tableHeaderWeekly','tableHeaderSalesman','tableHeaderSummaryDepo','tableHeaderSummaryTipe'].forEach(id => {
                    const hdr = document.getElementById(id);
                    if (!hdr) return;
                    hdr.querySelectorAll(`th.w${n}.wk-detail`).forEach(el => el.classList.toggle('wk-hidden', !wkDetailVisible));
                    const grpTh = hdr.querySelector(`th[data-week="${n}"]`);
                    if (grpTh) grpTh.setAttribute('colspan', wkDetailVisible ? parseInt(grpTh.dataset.full||9) : parseInt(grpTh.dataset.small||4));
                    hdr.querySelectorAll(`.wk-per-btn[data-wnum="${n}"]`).forEach(btn => {
                        btn.textContent = wkDetailVisible ? '−' : '+';
                        btn.classList.toggle('collapsed', !wkDetailVisible);
                    });
                });
            });
            // Update global toggle button
            document.querySelectorAll('.wk-toggle-btn').forEach(btn => {
                btn.innerHTML = wkDetailVisible ? '− All' : '+ All';
                btn.classList.toggle('collapsed', !wkDetailVisible);
            });
        }

        // ===== FLOATING COL SETTINGS =====
        function toggleColSettings() {
            const panel = document.getElementById('colSettingsPanel');
            panel.classList.toggle('open');
        }

        function applyColWidth(varName, value) {
            document.documentElement.style.setProperty(varName, value);
        }

        function resetColWidths() {
            const defaults = {
                '--col-sticky': '100px',
                '--col-detail': '52px',
                '--col-result': '45px',
                '--col-mtd':    '45px'
            };
            const vals = ['100', '52', '45', '45'];
            Object.entries(defaults).forEach(([k, v]) => {
                document.documentElement.style.setProperty(k, v);
            });
            // Reset sliders & labels
            const panel = document.getElementById('colSettingsPanel');
            if (panel) {
                const inputs = panel.querySelectorAll('input[type=range]');
                const spans  = panel.querySelectorAll('span');
                inputs[0].value = 100; spans[0].textContent = '100px';
                inputs[1].value = 52;  spans[1].textContent = '52px';
                inputs[2].value = 45;  spans[2].textContent = '45px';
                inputs[3].value = 45;  spans[3].textContent = '45px';
            }
        }

        // function hardRefresh() {
        //     // Hapus semua cache service worker jika ada
        //     if ('caches' in window) {
        //         caches.keys().then(names => names.forEach(name => caches.delete(name)));
        //     }
        //     // Force reload bypass cache (Ctrl+F5 effect)
        //     location.reload(true);
        // }

        async function hardRefresh() {
            // 1. Hapus semua CacheStorage (PWA / Service Worker) jika ada
            if ('caches' in window) {
                try {
                    const names = await caches.keys();
                    await Promise.all(names.map(name => caches.delete(name)));
                } catch (e) {
                    console.error("Gagal menghapus cache storage:", e);
                }
            }
            
            // 2. Akali HTTP Cache dengan menambahkan parameter unik (timestamp) ke URL
            // Ini memaksa browser menganggap halaman ini benar-benar baru
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('reload_ts', Date.now());
            
            // 3. Alihkan halaman ke URL baru tersebut
            window.location.href = currentUrl.toString();
        }
        
        function switchTab(tab) {
            currentTab = tab;
            
            // Show floating col settings button only on weekly/salesman tabs
            const floatBtn = document.getElementById('colSettingsFloat');
            if (floatBtn) {
                if (tab === 'weekly' || tab === 'salesman') {
                    floatBtn.classList.add('visible');
                } else {
                    floatBtn.classList.remove('visible');
                    document.getElementById('colSettingsPanel').classList.remove('open');
                }
            }
            
            // Update tab buttons
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            // Update tab content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'summary') {
                document.getElementById('tabSummary').classList.add('active');
                // Process summary if not already processed
                if (document.getElementById('tableBodySummaryDepo').innerHTML === '') {
                    document.getElementById('loadingSummaryDepo').style.display = 'none';
                    processSummaryByDepo();
                }
                if (document.getElementById('tableBodySummaryTipe').innerHTML === '') {
                    document.getElementById('loadingSummaryTipe').style.display = 'none';
                    processSummaryByTipe();
                }
            } else if (tab === 'summaryDash') {
                document.getElementById('tabSummaryDash').classList.add('active');
                // Pastikan catData & catBpData loaded, dan WEEKS_CONFIG terisi
                if (WEEKS_CONFIG.length === 0) {
                    // generate weeks config tanpa perlu render table
                    const _weeks = getWeeksForMonth();
                    WEEKS_CONFIG = _weeks.map(w => `W${w.num}`);
                    WEEKS_CONFIG.push('MTD');
                }
                if (!catData) {
                    // Load catData dulu, render setelah selesai
                    loadCategoryData().then(() => renderSummaryDash()).catch(() => renderSummaryDash());
                } else {
                    renderSummaryDash();
                }
            } else if (tab === 'weekly') {
                document.getElementById('tabWeekly').classList.add('active');
                // Process weekly if not already processed
                if (document.getElementById('tableBodyWeekly').innerHTML === '') {
                    document.getElementById('loadingWeekly').style.display = 'none';
                    processAndRender('Weekly');
                }
            } else if (tab === 'salesman') {
                document.getElementById('tabSalesman').classList.add('active');
            } else if (tab === 'pareto') {
                document.getElementById('tabPareto').classList.add('active');
            } else if (tab === 'pareto25') {
                document.getElementById('tabPareto25').classList.add('active');
                loadPareto25Data();
                if (document.getElementById('paretoSalesmanSelect').options.length === 1) {
                    loadParetoSalesmanList();
                }
                filterPareto();
            } else if (tab === 'category') {
                document.getElementById('tabCategory').classList.add('active');
                if (!catData) loadCategoryData();
            } else if (tab === 'upload') {
                document.getElementById('tabUpload').classList.add('active');
                setUploadExpectedFilenames();
            } else if (tab === 'trend') {
                document.getElementById('tabTrend').classList.add('active');
                if (!window.trendLoaded) loadTrendData();
            } else if (tab === 'ai') {
                document.getElementById('tabAI').classList.add('active');
                if (!window._aiInitialized) initAIInsight();
            } else if (tab === 'klasemen') {
                document.getElementById('tabKlasemen').classList.add('active');
                if (!window._klasemenLoaded) {
                    renderKlasemenDepo();
                }
            } else if (tab === 'project') {
                document.getElementById('tabProject').classList.add('active');
                if (!projectData) {
                    loadProjectData();
                }
            }
        }


        // ===================================================================
        // 25 PARETO — Outlet & SKU
        // ===================================================================
        let _pareto25OutletData = null;
        let _pareto25SkuData    = null;
        let _pareto25ActivePr   = 'ALL';   // 'ALL' = tampilkan baris Principle ALL

        async function loadPareto25Data() {
            _pareto25ActivePr = 'ALL'; // Reset ke All saat load data baru
            window._prosesLoaded = false; // Reset proses cache
            window._smProsesLoaded = false; window._smProsesRows = null; // Reset salesman proses cache
            // Reset tombol filter
            document.querySelectorAll('.p25-filter-btn').forEach(b => b.classList.remove('active'));
            const allBtn = document.querySelector('.p25-filter-btn[data-pr="ALL"]');
            if (allBtn) allBtn.classList.add('active');
            const suffix = selectedDepo.replace(/^data_DEPO_/i, '')
                                       .replace(/^data_SUMMARY$/i, '');

            // Jika Summary Regional — agregasi semua depo
            const isRegional = (selectedDepo === 'data_SUMMARY');

            if (isRegional) {
                await loadPareto25Regional();
            } else {
                await loadPareto25Depo(suffix);
            }
        }

        async function loadPareto25Depo(suffix) {
            document.getElementById('loadingPareto25Outlet').style.display = '';
            document.getElementById('loadingPareto25Sku').style.display    = '';
            document.getElementById('pareto25OutletWrap').innerHTML        = '';
            document.getElementById('pareto25SkuWrap').innerHTML           = '';

            try {
                const [rOut, rSku] = await Promise.all([
                    fetch('outlet_DEPO_' + suffix + '.json'),
                    fetch('sku_DEPO_'    + suffix + '.json'),
                ]);
                _pareto25OutletData = rOut.ok ? ((await rOut.json()).data || []) : [];
                _pareto25SkuData    = rSku.ok ? ((await rSku.json()).data || []) : [];
            } catch(e) {
                _pareto25OutletData = [];
                _pareto25SkuData    = [];
            }
            renderPareto25Outlet();
            renderPareto25Sku();
        }

        async function loadPareto25Regional() {
            document.getElementById('loadingPareto25Outlet').textContent = '⏳ Memuat data semua depo...';
            document.getElementById('loadingPareto25Sku').textContent    = '⏳ Memuat data semua depo...';
            document.getElementById('pareto25OutletWrap').innerHTML = '';
            document.getElementById('pareto25SkuWrap').innerHTML    = '';

            const depos = Object.keys(window._depoStatus || {});
            if (depos.length === 0) {
                _pareto25OutletData = [];
                _pareto25SkuData    = [];
                renderPareto25Outlet();
                renderPareto25Sku();
                return;
            }

            const fetchArr = async (url) => {
                try { const r = await fetch(url); return r.ok ? ((await r.json()).data || []) : []; }
                catch { return []; }
            };

            const results = await Promise.all(depos.map(d => Promise.all([
                fetchArr('outlet_DEPO_' + d + '.json'),
                fetchArr('sku_DEPO_'    + d + '.json'),
            ])));

            _pareto25OutletData = results.flatMap(([o]) => o);
            _pareto25SkuData    = results.flatMap(([,s]) => s);
            renderPareto25Outlet();
            renderPareto25Sku();
        }

        function filterPareto25Outlet(btn) {
            document.querySelectorAll('.p25-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            _pareto25ActivePr = btn.dataset.pr;
            renderPareto25Outlet();
        }

        function switchPareto25SubTab(tab, event) {
            document.querySelectorAll('#tabPareto25 .sub-tab').forEach(t => t.classList.remove('active'));
            if (event && event.target) event.target.classList.add('active');
            document.getElementById('pareto25SubTabOutlet').classList.toggle('active', tab === 'outlet');
            document.getElementById('pareto25SubTabSku').classList.toggle('active', tab === 'sku');
        }

        function renderPareto25Metrics() {
            const row = document.getElementById('pareto25MetricsRow');
            if (!row) return;
            row.innerHTML = '';

            const outletData = _pareto25OutletData || [];
            const skuData    = _pareto25SkuData    || [];

            const jt = v => {
                const m = Math.abs(v)/1e6;
                return m >= 1000 ? m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'jt'
                     : m >= 1    ? m.toFixed(1) + 'jt'
                     : (Math.abs(v)/1e3).toFixed(0) + 'rb';
            };

            // 4 Principle cards from outlet data
            const principles = ['GPPJ', 'GEN', 'GBS', 'MBR'];
            const prColors   = { GPPJ:'#7c3aed', GEN:'#0369a1', GBS:'#16a34a', MBR:'#dc2626' };
            const prLight    = { GPPJ:'#f5f3ff', GEN:'#e0f2fe', GBS:'#dcfce7', MBR:'#fee2e2' };

            principles.forEach(pr => {
                const rows = outletData.filter(r => r.Principle === pr && r.Principle !== 'ALL');
                if (rows.length === 0) return;

                const totMTD = rows.reduce((s,r) => s + (r.MTD||0), 0);
                const totL3M = rows.reduce((s,r) => s + (r.L3M||0), 0);
                const achL3M = totL3M > 0 ? (totMTD / totL3M * 100) : 0;
                const cls    = achL3M >= 100 ? 'p25-green' : achL3M >= 80 ? 'p25-orange' : 'p25-red';
                const valCls = achL3M >= 100 ? 'p25-ach-hi' : achL3M >= 80 ? 'p25-ach-md' : 'p25-ach-lo';
                const col    = prColors[pr] || '#667eea';

                const card = document.createElement('div');
                card.className = 'p25-metric-card ' + cls;
                card.style.borderTopColor = col;
                card.title = 'Klik untuk filter ' + pr;
                card.onclick = () => {
                    switchPareto25SubTab('outlet', null);
                    document.querySelectorAll('.p25-filter-btn').forEach(b => b.classList.remove('active'));
                    const btn = document.querySelector('.p25-filter-btn[data-pr="' + pr + '"]');
                    if (btn) { btn.classList.add('active'); _pareto25ActivePr = pr; renderPareto25Outlet(); }
                };
                card.innerHTML =
                    '<div class="p25-metric-label">' + pr + ' — Outlet</div>'
                    + '<div class="p25-metric-value ' + valCls + '">' + achL3M.toFixed(1) + '%</div>'
                    + '<div class="p25-metric-sub">' + rows.length + ' outlet · MTD ' + jt(totMTD) + '</div>';
                row.appendChild(card);
            });

            // 1 SKU card
            const skuMTD = skuData.reduce((s,r) => s + (r.MTD||0), 0);
            const skuL3M = skuData.reduce((s,r) => s + (r.L3M||0), 0);
            const skuAch = skuL3M > 0 ? (skuMTD / skuL3M * 100) : 0;
            const skuCls    = skuAch >= 100 ? 'p25-green' : skuAch >= 80 ? 'p25-orange' : 'p25-red';
            const skuValCls = skuAch >= 100 ? 'p25-ach-hi' : skuAch >= 80 ? 'p25-ach-md' : 'p25-ach-lo';

            const skuCard = document.createElement('div');
            skuCard.className = 'p25-metric-card p25-blue ' + skuCls;
            skuCard.title = 'Klik untuk lihat 25 Pareto SKU';
            skuCard.onclick = () => {
                const skuTab = document.querySelector('#tabPareto25 .sub-tab:nth-child(2)');
                switchPareto25SubTab('sku', { target: skuTab });
                if (skuTab) { document.querySelectorAll('#tabPareto25 .sub-tab').forEach(t => t.classList.remove('active')); skuTab.classList.add('active'); }
            };
            skuCard.innerHTML =
                '<div class="p25-metric-label">25 Pareto SKU</div>'
                + '<div class="p25-metric-value ' + skuValCls + '">' + skuAch.toFixed(1) + '%</div>'
                + '<div class="p25-metric-sub">' + skuData.length + ' SKU · MTD ' + jt(skuMTD) + '</div>';
            row.appendChild(skuCard);
        }

        function renderPareto25Outlet() {
            const wrap    = document.getElementById('pareto25OutletWrap');
            const loading = document.getElementById('loadingPareto25Outlet');
            loading.style.display = 'none';

            let data = _pareto25OutletData || [];
            // Filter: 'ALL' → tampilkan baris Principle=ALL, lainnya → filter per principle
            data = data.filter(r => r.Principle === _pareto25ActivePr);

            // Sort by L3M desc, take top 25
            data = [...data].sort((a,b) => (b.L3M||0)-(a.L3M||0)).slice(0, 25);

            if (data.length === 0) {
                wrap.innerHTML = '<p style="color:#888;padding:20px;">Tidak ada data.</p>';
                document.getElementById('pareto25OutletCount').textContent = '';
                return;
            }
            document.getElementById('pareto25OutletCount').textContent = data.length + ' outlet';

            const jt = v => {
                if (!v && v !== 0) return '<span style="color:#cbd5e1;">—</span>';
                const m = v/1e6, abs = Math.abs(m);
                const s = abs >= 1000 ? abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'jt'
                        : abs >= 1    ? abs.toFixed(1) + 'jt'
                        : (Math.abs(v)/1e3).toFixed(0) + 'rb';
                return (v < 0 ? '<span class="p25-dn">-' : '') + s + (v < 0 ? '</span>' : '');
            };

            const pctCell = (mtd, base) => {
                if (!base || base === 0) return '<span style="color:#cbd5e1;">—</span>';
                const p = (mtd / base * 100);
                const cls = p >= 100 ? 'p25-up' : p >= 80 ? 'p25-neut' : 'p25-dn';
                return '<span class="' + cls + '">' + p.toFixed(1) + '%</span>';
            };

            const gapCell = (mtd, base) => {
                if (!mtd && mtd !== 0) return '<span style="color:#cbd5e1;">—</span>';
                const gap = (mtd||0) - (base||0);
                const cls = gap >= 0 ? 'p25-up' : 'p25-dn';
                const m = gap/1e6, abs = Math.abs(m);
                const s = abs >= 1 ? abs.toFixed(1)+'jt' : (Math.abs(gap)/1e3).toFixed(0)+'rb';
                return '<span class="' + cls + '">' + (gap >= 0 ? '+' : '-') + s + '</span>';
            };

            let html = '<div class="p25-table-wrap"><table><thead><tr>'
                + '<th class="p25-num p25-pos">#</th>'
                + '<th class="p25-name">Nama Pelanggan</th>'
                + '<th>Principle</th>'
                + '<th>L3M</th>'
                + '<th>LY</th>'
                + '<th>LM</th>'
                + '<th>MTD</th>'
                + '<th>Gap vs L3M</th>'
                + '<th>vs LY</th>'
                + '<th>vs L3M</th>'
                + '<th>vs LM</th>'
                + '</tr>';

            // Hitung total & rata-rata
            const tot = { L3M:0, LY:0, LM:0, MTD:0 };
            data.forEach(r => { tot.L3M+=r.L3M||0; tot.LY+=r.LY||0; tot.LM+=r.LM||0; tot.MTD+=r.MTD||0; });
            const tot_gap = tot.MTD - tot.L3M;
            const totStyle = 'background:#1e3a5f;color:white;font-weight:700;padding:6px 12px;white-space:nowrap;';
            const totValStyle = 'background:#1e3a5f;font-weight:700;padding:6px 12px;text-align:right;white-space:nowrap;';

            const pctTot = (a,b) => {
                if (!b) return '<span style="color:#94a3b8;">—</span>';
                const p = a/b*100;
                return '<span style="color:' + (p>=100?'#86efac':p>=80?'#fde68a':'#fca5a5') + ';font-weight:700;">' + p.toFixed(1) + '%</span>';
            };
            const gapTot = (g) => {
                const m = g/1e6, abs = Math.abs(m);
                const s = abs>=1 ? abs.toFixed(1)+'jt' : (Math.abs(g)/1e3).toFixed(0)+'rb';
                return '<span style="color:' + (g>=0?'#86efac':'#fca5a5') + ';font-weight:700;">' + (g>=0?'+':'-') + s + '</span>';
            };
            const jtTot = v => {
                const m = Math.abs(v)/1e6;
                const s = m>=1000 ? m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'jt' : m>=1 ? m.toFixed(1)+'jt' : (Math.abs(v)/1e3).toFixed(0)+'rb';
                return '<span style="color:white;">' + s + '</span>';
            };

            // Total row (dark header style)
            html += '<tr class="p25-total-row">'
                + '<td style="' + totStyle + 'text-align:center;color:#94a3b8;">Σ</td>'
                + '<td style="' + totStyle + 'text-align:left;">' + data.length + ' outlet</td>'
                + '<td style="' + totStyle + 'text-align:center;color:#94a3b8;">—</td>'
                + '<td style="' + totValStyle + '">' + jtTot(tot.L3M) + '</td>'
                + '<td style="' + totValStyle + '">' + jtTot(tot.LY)  + '</td>'
                + '<td style="' + totValStyle + '">' + jtTot(tot.LM)  + '</td>'
                + '<td style="' + totValStyle + '">' + jtTot(tot.MTD) + '</td>'
                + '<td style="' + totValStyle + '">' + gapTot(tot_gap) + '</td>'
                + '<td style="' + totValStyle + '">' + pctTot(tot.MTD, tot.LY)  + '</td>'
                + '<td style="' + totValStyle + '">' + pctTot(tot.MTD, tot.L3M) + '</td>'
                + '<td style="' + totValStyle + '">' + pctTot(tot.MTD, tot.LM)  + '</td>'
                + '</tr></thead><tbody>';

            data.forEach((r, i) => {
                html += '<tr>'
                    + '<td class="p25-pos">' + (i+1) + '</td>'
                    + '<td class="p25-left"><span style="font-weight:600;">' + (r['Nama Pelanggan'] || r['SzCustId'] || '—') + '</span>'
                    + '<br><span style="color:#94a3b8;font-size:10px;">' + (r['SzCustId'] || '') + '</span></td>'
                    + '<td style="text-align:center;"><span style="background:#e0f2fe;color:#0369a1;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;">' + (r.Principle||'—') + '</span></td>'
                    + '<td>' + jt(r.L3M) + '</td>'
                    + '<td>' + jt(r.LY)  + '</td>'
                    + '<td>' + jt(r.LM)  + '</td>'
                    + '<td style="font-weight:700;">' + jt(r.MTD) + '</td>'
                    + '<td>' + gapCell(r.MTD, r.L3M) + '</td>'
                    + '<td>' + pctCell(r.MTD, r.LY)  + '</td>'
                    + '<td>' + pctCell(r.MTD, r.L3M) + '</td>'
                    + '<td>' + pctCell(r.MTD, r.LM)  + '</td>'
                    + '</tr>';
            });

            html += '</tbody></table></div>';
            wrap.innerHTML = html;
        }

        function renderPareto25Sku() {
            const wrap    = document.getElementById('pareto25SkuWrap');
            const loading = document.getElementById('loadingPareto25Sku');
            loading.style.display = 'none';

            // Group by SzNickName — sum L3M/LY/LM/MTD, rata-rata OFR2
            const _skuMap = {};
            (_pareto25SkuData || []).forEach(r => {
                const key = r.SzNickName || r.SzName || '?';
                if (!_skuMap[key]) {
                    _skuMap[key] = { ...r, L3M: 0, LY: 0, LM: 0, MTD: 0, _ofrSum: 0, _ofrCnt: 0 };
                }
                _skuMap[key].L3M += r.L3M || 0;
                _skuMap[key].LY  += r.LY  || 0;
                _skuMap[key].LM  += r.LM  || 0;
                _skuMap[key].MTD += r.MTD || 0;
                if (r.OFR2 != null) { _skuMap[key]._ofrSum += r.OFR2; _skuMap[key]._ofrCnt++; }
            });
            Object.values(_skuMap).forEach(r => {
                r.OFR2 = r._ofrCnt > 0 ? r._ofrSum / r._ofrCnt : null;
            });
            let data = Object.values(_skuMap).sort((a,b) => (b.L3M||0)-(a.L3M||0)).slice(0, 25);

            if (data.length === 0) {
                wrap.innerHTML = '<p style="color:#888;padding:20px;">Tidak ada data.</p>';
                return;
            }

            const jt = v => {
                if (!v && v !== 0) return '<span style="color:#cbd5e1;">—</span>';
                const m = v/1e6, abs = Math.abs(m);
                const s = abs >= 1000 ? abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.') + 'jt'
                        : abs >= 1    ? abs.toFixed(1) + 'jt'
                        : (Math.abs(v)/1e3).toFixed(0) + 'rb';
                return (v < 0 ? '<span class="p25-dn">-' : '') + s + (v < 0 ? '</span>' : '');
            };

            const pctCell = (mtd, base) => {
                if (!base || base === 0) return '<span style="color:#cbd5e1;">—</span>';
                const p = (mtd / base * 100);
                const cls = p >= 100 ? 'p25-up' : p >= 80 ? 'p25-neut' : 'p25-dn';
                return '<span class="' + cls + '">' + p.toFixed(1) + '%</span>';
            };

            const gapCell = (mtd, base) => {
                if (!mtd && mtd !== 0) return '<span style="color:#cbd5e1;">—</span>';
                const gap = (mtd||0) - (base||0);
                const cls = gap >= 0 ? 'p25-up' : 'p25-dn';
                const m = gap/1e6, abs = Math.abs(m);
                const s = abs >= 1 ? abs.toFixed(1)+'jt' : (Math.abs(gap)/1e3).toFixed(0)+'rb';
                return '<span class="' + cls + '">' + (gap >= 0 ? '+' : '-') + s + '</span>';
            };

            const ofr = v => {
                if (v === null || v === undefined) return '—';
                return (v * 100).toFixed(1) + '%';
            };

            let html = '<div class="p25-table-wrap"><table><thead><tr>'
                + '<th class="p25-num p25-pos">#</th>'
                + '<th class="p25-name">Nama SKU</th>'
                + '<th class="p25-nick">Nick</th>'
                + '<th>L3M</th>'
                + '<th>LY</th>'
                + '<th>LM</th>'
                + '<th>MTD</th>'
                + '<th>Gap vs L3M</th>'
                + '<th>vs LY</th>'
                + '<th>vs L3M</th>'
                + '<th>vs LM</th>'
                + '<th>OFR</th>'
                + '</tr>';

            // Hitung total & rata-rata SKU
            const tots = { L3M:0, LY:0, LM:0, MTD:0 };
            data.forEach(r => { tots.L3M+=r.L3M||0; tots.LY+=r.LY||0; tots.LM+=r.LM||0; tots.MTD+=r.MTD||0; });
            const tots_gap = tots.MTD - tots.L3M;
            const avgOfr = data.length > 0 ? data.reduce((s,r) => s+(r.OFR2||0), 0) / data.length : 0;

            const totStyleS = 'background:#1e3a5f;color:white;font-weight:700;padding:6px 12px;white-space:nowrap;';
            const totValStyleS = 'background:#1e3a5f;font-weight:700;padding:6px 12px;text-align:right;white-space:nowrap;';

            const pctTotS = (a,b) => {
                if (!b) return '<span style="color:#94a3b8;">—</span>';
                const p = a/b*100;
                return '<span style="color:' + (p>=100?'#86efac':p>=80?'#fde68a':'#fca5a5') + ';font-weight:700;">' + p.toFixed(1) + '%</span>';
            };
            const gapTotS = (g) => {
                const m = g/1e6, abs = Math.abs(m);
                const s = abs>=1 ? abs.toFixed(1)+'jt' : (Math.abs(g)/1e3).toFixed(0)+'rb';
                return '<span style="color:' + (g>=0?'#86efac':'#fca5a5') + ';font-weight:700;">' + (g>=0?'+':'-') + s + '</span>';
            };
            const jtTotS = v => {
                const m = Math.abs(v)/1e6;
                const s = m>=1000 ? m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+'jt' : m>=1 ? m.toFixed(1)+'jt' : (Math.abs(v)/1e3).toFixed(0)+'rb';
                return '<span style="color:white;">' + s + '</span>';
            };

            html += '<tr class="p25-total-row">'
                + '<td style="' + totStyleS + 'text-align:center;color:#94a3b8;">Σ</td>'
                + '<td style="' + totStyleS + 'text-align:left;">' + data.length + ' SKU</td>'
                + '<td style="' + totStyleS + 'text-align:center;color:#94a3b8;">—</td>'
                + '<td style="' + totValStyleS + '">' + jtTotS(tots.L3M) + '</td>'
                + '<td style="' + totValStyleS + '">' + jtTotS(tots.LY)  + '</td>'
                + '<td style="' + totValStyleS + '">' + jtTotS(tots.LM)  + '</td>'
                + '<td style="' + totValStyleS + '">' + jtTotS(tots.MTD) + '</td>'
                + '<td style="' + totValStyleS + '">' + gapTotS(tots_gap) + '</td>'
                + '<td style="' + totValStyleS + '">' + pctTotS(tots.MTD, tots.LY)  + '</td>'
                + '<td style="' + totValStyleS + '">' + pctTotS(tots.MTD, tots.L3M) + '</td>'
                + '<td style="' + totValStyleS + '">' + pctTotS(tots.MTD, tots.LM)  + '</td>'
                + '<td style="' + totValStyleS + 'color:#7dd3fc;">' + (avgOfr*100).toFixed(1) + '% avg</td>'
                + '</tr></thead><tbody>';

            data.forEach((r, i) => {
                html += '<tr>'
                    + '<td class="p25-pos">' + (i+1) + '</td>'
                    + '<td class="p25-left" style="font-weight:600;">' + (r.SzName || '—') + '</td>'
                    + '<td class="p25-nick" style="color:#64748b;font-size:10px;">' + (r.SzNickName || '—') + '</td>'
                    + '<td>' + jt(r.L3M) + '</td>'
                    + '<td>' + jt(r.LY)  + '</td>'
                    + '<td>' + jt(r.LM)  + '</td>'
                    + '<td style="font-weight:700;">' + jt(r.MTD) + '</td>'
                    + '<td>' + gapCell(r.MTD, r.L3M) + '</td>'
                    + '<td>' + pctCell(r.MTD, r.LY)  + '</td>'
                    + '<td>' + pctCell(r.MTD, r.L3M) + '</td>'
                    + '<td>' + pctCell(r.MTD, r.LM)  + '</td>'
                    + '<td style="color:#0369a1;">' + ofr(r.OFR2) + '</td>'
                    + '</tr>';
            });

            html += '</tbody></table>';
            wrap.innerHTML = html;
            // Render metric cards setelah kedua tabel selesai di-render
            renderPareto25Metrics();
        }

        function switchSummarySubTab(subTab) {
            // Update sub-tab buttons — scope only inside #tabSummary
            document.querySelectorAll('#tabSummary .sub-tab').forEach(t => t.classList.remove('active'));
            event.target.classList.add('active');
            
            // Update sub-tab content — scope only inside #tabSummary
            document.querySelectorAll('#tabSummary .sub-tab-content').forEach(c => c.classList.remove('active'));
            
            if (subTab === 'depo') {
                document.getElementById('summarySubTabDepo').classList.add('active');
                if (document.getElementById('tableBodySummaryDepo').innerHTML === '') {
                    document.getElementById('loadingSummaryDepo').style.display = 'none';
                    processSummaryByDepo();
                }
            } else if (subTab === 'tipe') {
                document.getElementById('summarySubTabTipe').classList.add('active');
                if (document.getElementById('tableBodySummaryTipe').innerHTML === '') {
                    document.getElementById('loadingSummaryTipe').style.display = 'none';
                    processSummaryByTipe();
                }
            }
        }

        let hkData = null;

        async function loadHK() {
            try {
                const res = await fetch('HK.json?_=' + Date.now());
                hkData = await res.json();
            } catch (e) {
                console.warn('HK.json tidak ditemukan, pakai default.');
                hkData = null;
            }
        }

        // Hari Kerja modal helpers
        function openHariKerjaModal() {
            document.getElementById('hariKerjaModal').classList.add('show-flex');
            loadHKModal();
        }

        function countWorkingDays(fromStr, toStr) {
            if (!fromStr || !toStr) return 0;
            const a = new Date(fromStr);
            const b = new Date(toStr);
            if (isNaN(a) || isNaN(b) || a > b) return 0;
            let cnt = 0;
            for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
                const day = d.getDay();
                if (day !== 0) cnt++; // Hanya Minggu (0) yang dikecualikan
            }
            return cnt;
        }

        function updateCounts() {
            for (let i = 1; i <= 5; i++) {
                const from  = document.getElementById(`w${i}_from`).value;
                const to    = document.getElementById(`w${i}_to`).value;
                const input = document.getElementById(`w${i}_count`);
                const hk = countWorkingDays(from, to);
                input.value = hk;
                input.title = `Otomatis: ${hk} hari. Bisa diedit manual jika ada hari libur.`;
            }
        }

        async function saveHK() {
            const data = {};
            for (let i = 1; i <= 5; i++) {
                const from = document.getElementById(`w${i}_from`).value || null;
                const to   = document.getElementById(`w${i}_to`).value || null;
                const hk   = parseInt(document.getElementById(`w${i}_count`).value) || 0;
                data[`W${i}`] = { from, to, hk };
            }
            const json = JSON.stringify(data, null, 2);
            const canUpload = typeof window.uploadToGitHub === 'function';
            if (canUpload) {
                const ok = await uploadToGitHub('HK.json', json);
                if (ok) {
                    alert('HK.json berhasil diupload ke GitHub.');
                    document.getElementById('hariKerjaModal').classList.remove('show-flex');
                    return;
                }
                alert('Upload ke GitHub gagal. File akan disimpan secara lokal sebagai cadangan.');
            }
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'HK.json';
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            alert('Pengaturan disimpan ke file HK.json (download).');
        }

        function loadHKModal() {
            fetch('HK.json').then(r => {
                if (!r.ok) throw 'no';
                return r.json();
            }).then(obj => {
                for (let i = 1; i <= 5; i++) {
                    const w = obj['W' + i];
                    if (w) {
                        if (w.from) document.getElementById('w' + i + '_from').value = w.from;
                        if (w.to) document.getElementById('w' + i + '_to').value = w.to;
                    }
                }
                updateCounts();
            }).catch(() => {
                // no HK.json available — ignore
            });
        }

        function getWeeksForMonth() {
            const classes = ['w1', 'w2', 'w3', 'w4', 'w5'];
            const weeks = [];

            if (hkData) {
                // ✅ Ambil dari HK.json
                for (let i = 1; i <= 5; i++) {
                    const key = 'W' + i;
                    const w = hkData[key];
                    if (!w || !w.from || !w.to) continue; // skip jika null (W5 kosong)

                    const fromDate = new Date(w.from);
                    const toDate   = new Date(w.to);

                    weeks.push({
                        num   : i,
                        start : fromDate.getDate(),
                        end   : toDate.getDate(),
                        from  : w.from,
                        to    : w.to,
                        hk    : w.hk,
                        class : classes[i - 1]
                    });
                }
            } else {
                // ⚠️ Fallback hardcode jika HK.json gagal load
                weeks.push(
                    { num:1, start:2,  end:9,  class:'w1' },
                    { num:2, start:11, end:16, class:'w2' },
                    { num:3, start:18, end:23, class:'w3' },
                    { num:4, start:25, end:30, class:'w4' }
                );
            }

            return weeks;
        }

        function generateTableHeader(targetId) {
            const now = new Date();
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthName = monthNames[now.getMonth()];
            
            const weeks = getWeeksForMonth();
            
            WEEKS_CONFIG = weeks.map(w => `W${w.num}`);
            WEEKS_CONFIG.push('MTD');
            
            let html = '<tr><th rowspan="2" class="sticky-col">CHANNEL</th>';
            weeks.forEach(w => {
                html += `<th colspan="9" class="${w.class}" data-week="${w.num}" data-full="9" data-small="4" style="cursor:default;">W${w.num} (${w.start}-${w.end} ${monthName})<button class="wk-per-btn" data-wnum="${w.num}" onclick="event.stopPropagation();toggleWeekCols(${w.num})" title="Sembunyikan/tampilkan kolom detail W${w.num}">−</button></th>`;
            });
            html += '<th colspan="13" class="mtd">MTD</th></tr>';
            
            html += '<tr class="sub-header">';
            const weekCols = [
                ['LY','ly'], ['LM','lm'], ['BE','be'], ['BP','bp'], ['Act','act'],
                ['%BP','pct-bp'], ['G-BP','gap-bp'], ['%BE','pct-be'], ['G-BE','gap-be']
            ];
            const detailSet = new Set(['ly','lm','be','bp','act']);
            const mtdCols = ['CR', 'CA', '%', 'LY', 'LM', 'L3M', 'BE', 'BP', 'Act', '%BP', 'G-BP', '%BE', 'G-BE'];
            
            weeks.forEach(w => {
                weekCols.forEach(([col, dcol]) => {
                    const extraCls = detailSet.has(dcol) ? ' wk-detail' : ' wk-result';
                    html += `<th class="${w.class}${extraCls}" data-col="${dcol}">${col}</th>`;
                });
            });
            mtdCols.forEach(col => {
                html += `<th class="mtd wk-mtd-cell">${col}</th>`;
            });
            html += '</tr>';
            
            document.getElementById(targetId).innerHTML = html;
        }

        async function showDashboard() {
            showPage('dashboard');
            
            const username = sessionStorage.getItem('user');
            document.getElementById('userName').textContent = username;

            // Sesuaikan tombol header berdasarkan role
            const btnGanti = document.getElementById('btnGantiDepo');
            const btnSummary = document.getElementById('btnSummaryDepo');
            const btnPwd = document.getElementById('btnKelolaPwd');
            if (currentRole === 'depo') {
                if (btnGanti) btnGanti.style.display = 'none';
                if (btnSummary) btnSummary.style.display = '';
                if (btnPwd) btnPwd.style.display = 'none';
            } else {
                if (btnGanti) btnGanti.style.display = '';
                if (btnSummary) btnSummary.style.display = 'none';
                if (btnPwd) btnPwd.style.display = currentRole === 'admin' ? '' : 'none';
            }
            const hkOpt = document.getElementById('hariKerjaOptionCard');
            const adminOpt = document.getElementById('adminOptionCard');
            if (hkOpt) hkOpt.style.display = currentRole === 'admin' ? '' : 'none';
            if (adminOpt) adminOpt.style.display = currentRole === 'admin' ? '' : 'none';

            // Load TG per-depo setelah depo diketahui
            let _tgSuffix = selectedDepo.replace(/^data_DEPO_/i, '');

            // ── Fix: Summary Regional → ambil TG dari TG_DEPO yang paling baru diupdate
            if (selectedDepo === 'data_SUMMARY') {
                try {
                    const dlRes = await fetch('depo_list.json');
                    if (dlRes.ok) {
                        const dl = await dlRes.json();
                        const depoNames = (dl.depos || []).map(normalizeDepoName);
                        // Fetch semua TG_DEPO secara paralel
                        const tgFetches = await Promise.all(depoNames.map(async d => {
                            try {
                                const r = await fetch('TG_DEPO_' + d + '.json');
                                if (!r.ok) return null;
                                const j = await r.json();
                                const lastUpd = (j.metadata && j.metadata.last_updated)
                                    ? new Date(j.metadata.last_updated) : new Date(0);
                                return { suffix: d, lastUpd };
                            } catch(e) { return null; }
                        }));
                        // Pilih depo dengan last_updated paling baru
                        const valid = tgFetches.filter(Boolean);
                        if (valid.length > 0) {
                            valid.sort((a, b) => b.lastUpd - a.lastUpd);
                            _tgSuffix = valid[0].suffix;
                            console.log('TG Regional: pakai TG_DEPO_' + _tgSuffix + '.json (paling update: ' + valid[0].lastUpd + ')');
                        }
                    }
                } catch(e) { console.warn('TG Regional fallback error:', e); }
            }

            await loadTGData(_tgSuffix);

            // Set last update date in dashboard header
            if (tgData && tgData['Day Closing']) {
                document.getElementById('dashboardLastUpdate').textContent = tgData['Day Closing'];
            }
            
            const isSummaryRegional = viewType === 'summary';
            
            if (isSummaryRegional) {
                document.getElementById('depoName').textContent = 'SUMMARY REGIONAL';
                
                // Tab layout Summary Regional — sama seperti Depo
                const tabsHtml = `
                    <div class="tab" onclick="switchTab('klasemen')">🏆 Klasemen Depo</div>
                    <div class="tab active" onclick="switchTab('summaryDash')">📊 Summary</div>
                    <div class="tab" onclick="switchTab('weekly')">Weekly</div>
                    <div class="tab" onclick="switchTab('salesman')">By Depo</div>
                    <div class="tab" onclick="switchTab('summary')">📋 By Depo/Tipe</div>
                    <div class="tab" onclick="switchTab('pareto25')">🏪 25 Pareto Depo</div>
                    <div class="tab" onclick="switchTab('project')">📋 Project</div>
                    <button onclick="hardRefresh()" title="Refresh"
                        style="padding:6px 10px; background:white; border:1.5px solid #cbd5e1;
                               border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; color:#475569;
                               display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;
                               box-shadow:0 1px 3px rgba(0,0,0,0.08); white-space:nowrap;"
                        onmouseover="this.style.background='#f0fdf4';this.style.borderColor='#16a34a';this.style.color='#16a34a';"
                        onmouseout="this.style.background='white';this.style.borderColor='#cbd5e1';this.style.color='#475569';">
                        🔄
                    </button>
                    <button class="wk-toggle-btn" id="wkToggleBtn" onclick="toggleWeekDetail()" title="Sembunyikan kolom LY/LM/BE/BP/Act">
                        − All
                    </button>
                `;
                document.getElementById('mainTabs').innerHTML = tabsHtml;
                
                // Default: buka tabSummaryDash (dashboard visual, bukan tabel)
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById('tabSummaryDash').classList.add('active');
            } else {
                const depoName = selectedDepo.replace('data_DEPO_', '').replace(/_/g, ' ');
                document.getElementById('depoName').textContent = depoName;
                
                // Show Weekly, Salesman, and Upload tabs for specific depo
                const tabsHtml = `
                    <div class="tab active" onclick="switchTab('weekly')">Weekly</div>
                    <div class="tab" onclick="switchTab('salesman')">By Salesman</div>
                    <div class="tab" onclick="switchTab('summaryDash')">📊 Summary</div>
                    <div class="tab" onclick="switchTab('pareto')">📊 30 Pareto Salesman</div>
                    <div class="tab" onclick="switchTab('pareto25')">🏪 25 Pareto Depo</div>
                    <div class="tab" onclick="switchTab('project')">📋 Project</div>
                    <div class="tab" onclick="switchTab('category')">📦 Category</div>
                    <div class="tab" onclick="switchTab('trend')">📈 Trend</div>
                    ${username === 'depo.tanjung' ? '<div class="tab" onclick="switchTab(\'ai\')">🤖 AI Insight</div>' : ''}
                    ${window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? '<div class="tab" onclick="switchTab(\'upload\')">📤 Upload Data</div>' : ''}
                    <button onclick="hardRefresh()" title="Refresh"
                        style="padding:6px 10px; background:white; border:1.5px solid #cbd5e1;
                               border-radius:8px; cursor:pointer; font-size:12px; font-weight:600; color:#475569;
                               display:inline-flex; align-items:center; gap:4px; transition:all 0.2s;
                               box-shadow:0 1px 3px rgba(0,0,0,0.08); white-space:nowrap;"
                        onmouseover="this.style.background='#f0fdf4';this.style.borderColor='#16a34a';this.style.color='#16a34a';"
                        onmouseout="this.style.background='white';this.style.borderColor='#cbd5e1';this.style.color='#475569';">
                        🔄
                    </button>
                    <button class="wk-toggle-btn" id="wkToggleBtn" onclick="toggleWeekDetail()" title="Sembunyikan kolom LY/LM/BE/BP/Act">
                        − All
                    </button>
                `;
                document.getElementById('mainTabs').innerHTML = tabsHtml;
                
                // Show Weekly tab by default
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                document.getElementById('tabWeekly').classList.add('active');
                // Show floating settings button
                const fb = document.getElementById('colSettingsFloat');
                if (fb) fb.classList.add('visible');
            }

            try {
                // TG data should already be loaded in tgData global variable
                let tgValue = 0;
                if (tgData) {
                    // Use TG_Percentage if available, otherwise calculate from TG
                    if (tgData['TG_Percentage'] !== undefined) {
                        tgValue = tgData['TG_Percentage'];
                    } else if (tgData['TG'] !== undefined) {
                        const tgRaw = tgData['TG'];
                        // If TG is decimal (0.173913), convert to percentage
                        if (tgRaw >= 0 && tgRaw <= 1) {
                            tgValue = (tgRaw * 100).toFixed(1);
                        } else {
                            tgValue = tgRaw.toFixed(1);
                        }
                    }
                }
                
                document.getElementById('tgDisplay').textContent = `Time Gone: ${tgValue}%`;
            } catch (e) { 
                console.log('TG.json not found or error:', e);
                document.getElementById('tgDisplay').textContent = 'Time Gone: N/A';
            }

            const fileName = `${selectedDepo}.json`;

            if (isSummaryRegional) {
                // Agregasi data dari semua depo
                const loadingEl = document.getElementById('loadingSummaryDash');
                if (loadingEl) loadingEl.textContent = '⏳ Memuat data semua depo...';
                await loadSummaryRegionalData();
            } else {
                let json;
                try {
                    const res = await fetch(fileName);
                    if (!res.ok) throw new Error('File not found');
                    json = await res.json();
                    rawData = json.data || [];
                    console.log('Data loaded from GitHub');
                } catch (error) {
                    console.error('Error loading data:', error);
                    alert(`Error loading data: ${error.message}`);
                    return;
                }
            }
            const json = { metadata: null }; // dummy agar kode metadata tidak error
            
            // Show last update from metadata (hanya untuk per-depo)
            if (!isSummaryRegional && json.metadata && json.metadata.last_updated) {
                const headerInfo = document.querySelector('.header-info');
                if (headerInfo && !isSummaryRegional) {
                    const existingUpdate = headerInfo.querySelector('.last-update-info');
                    if (!existingUpdate) {
                        const updateSpan = document.createElement('span');
                        updateSpan.className = 'last-update-info';
                        updateSpan.style.marginLeft = '15px';
                        updateSpan.style.fontSize = '11px';
                        updateSpan.style.color = '#666';
                        //updateSpan.textContent = `📅 Update: ${json.metadata.last_updated}`;
                        headerInfo.appendChild(updateSpan);
                    }
                }
            }
            
            try {
                
                // Generate headers for all tabs
                generateTableHeader('tableHeaderWeekly');
                generateTableHeader('tableHeaderSalesman');
                if (isSummaryRegional) {
                    generateTableHeader('tableHeaderSummaryDepo');
                    generateTableHeader('tableHeaderSummaryTipe');
                }
                
                // Load salesman list
                loadSalesmanList();
                
                // Show/hide Nama Salesman combo based on viewType
                const salesmanCombo = document.getElementById('salesmanComboContainer');
                if (salesmanCombo) {
                    if (isSummaryRegional) {
                        salesmanCombo.style.display = 'none'; // Hide for Summary Regional
                    } else {
                        salesmanCombo.style.display = 'inline'; // Show for specific Depo
                    }
                }

                // Update label tab & filter sesuai mode
                const smChannelLabel = document.getElementById('smChannelTabLabel');
                const smFilterLabel  = document.getElementById('smFilterLabel');
                if (smChannelLabel) smChannelLabel.textContent = isSummaryRegional ? '🏢 By Depo' : '📊 By Channel';
                if (smFilterLabel)  smFilterLabel.textContent  = isSummaryRegional ? 'Pilih Depo:' : 'Pilih Tipe Sales:';
                // Reset smProsesLoaded agar reload saat ganti mode
                window._smProsesWasRegional = isSummaryRegional;
                
                if (isSummaryRegional) {
                    // Data sudah di-load oleh loadSummaryRegionalData() di atas
                    document.getElementById('loadingSummaryDepo').style.display = 'none';
                    renderSummaryDash();
                } else {
                    // Process Weekly tab
                    document.getElementById('loadingWeekly').style.display = 'none';
                    processAndRender('Weekly');
                }
            } catch (e) {
                const loadingEl = isSummaryRegional ? 'loadingSummaryDepo' : 'loadingWeekly';
                document.getElementById(loadingEl).innerHTML = '<p style="color: #e74c3c;">❌ Error loading ' + fileName + '</p>';
                console.error(e);
            }
        }

        function loadSalesmanList() {
            const tipeSales = new Set();
            const salesmen = new Set();
            const salesmanToTipe = {};
            const tipeToSalesmen = {};
            
            rawData.forEach(row => {
                const tipe = row['Tipe Sales'] || row['tipe sales'] || row.TipeSales || row.tipesales || '';
                const salesman = row['Nama Salesman'] || row['nama salesman'] || row.Salesman || row.salesman || '';
                
                if (tipe) tipeSales.add(tipe);
                
                if (salesman && tipe) {
                    salesmen.add(salesman);
                    salesmanToTipe[salesman] = tipe;
                    
                    if (!tipeToSalesmen[tipe]) {
                        tipeToSalesmen[tipe] = new Set();
                    }
                    tipeToSalesmen[tipe].add(salesman);
                }
            });
            
            // Store globally
            window.salesmanToTipe = salesmanToTipe;
            window.tipeToSalesmen = tipeToSalesmen;
            window.allSalesmen = Array.from(salesmen).sort();
            window.allTipeSales = Array.from(tipeSales).sort();
            
            // Populate Tipe Sales dropdown
            const tipeSel = document.getElementById('tipeSalesSelect');
            const isSummaryRegional = viewType === 'summary';

            if (isSummaryRegional) {
                // Regional: isi dengan nama depo dari _depoStatus (semua depo) atau _depoAchMap
                const statusMap = window._depoStatus || {};
                const achMap    = window._depoAchMap  || {};
                // Gabungkan semua label depo yang diketahui
                const labelSet = new Set();
                Object.values(statusMap).forEach(v => { if (v.label) labelSet.add(v.label); });
                Object.values(achMap).forEach(v   => { if (v.label) labelSet.add(v.label); });
                const depoLabels = Array.from(labelSet).sort();
                tipeSel.innerHTML = '<option value="">-- Pilih Depo --</option>';
                depoLabels.forEach(label => {
                    const opt = document.createElement('option');
                    opt.value = label;
                    opt.textContent = label;
                    // Tandai depo yang belum ada datanya
                    const suffix = Object.entries(statusMap).find(([,v]) => v.label === label)?.[0];
                    const hasData = suffix && (window._depoDataByLabel || {})[label];
                    if (!hasData) opt.style.color = '#94a3b8';
                    tipeSel.appendChild(opt);
                });
            } else {
                tipeSel.innerHTML = '<option value="">-- All Tipe Sales --</option>';
                window.allTipeSales.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t;
                    opt.textContent = t;
                    tipeSel.appendChild(opt);
                });
                populateSalesmanDropdown(window.allSalesmen);
            }
            
            console.log('Loaded tipe sales:', window.allTipeSales);
            console.log('Loaded salesmen:', window.allSalesmen);
        }

        function populateSalesmanDropdown(salesmenList) {
            const sel = document.getElementById('salesmanSelect');
            sel.innerHTML = '<option value="">-- All Salesman --</option>';
            salesmenList.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                sel.appendChild(opt);
            });
        }

        async function filterByTipeSales() {
            const selectedTipe = document.getElementById('tipeSalesSelect').value;
            const isSummaryRegional = viewType === 'summary';
            
            // Reset salesman dropdown if visible
            if (!isSummaryRegional) {
                document.getElementById('salesmanSelect').value = '';
                
                if (!selectedTipe) {
                    // Show all salesmen
                    populateSalesmanDropdown(window.allSalesmen);
                } else {
                    // Filter salesmen by tipe
                    const filteredSalesmen = Array.from(window.tipeToSalesmen[selectedTipe] || []).sort();
                    populateSalesmanDropdown(filteredSalesmen);
                }
            }
            
            // Apply filter
            await applyFilter();
        }

        async function filterBySalesman() {
            const selectedSalesman = document.getElementById('salesmanSelect').value;
            
            if (selectedSalesman) {
                // Auto-select corresponding Tipe Sales
                const tipe = window.salesmanToTipe[selectedSalesman];
                if (tipe) {
                    document.getElementById('tipeSalesSelect').value = tipe;
                }
            }
            
            // Apply filter
            await applyFilter();
        }

        // Helper: temukan suffix file dari depo label (e.g. "DEPO BALIKPAPAN" → "BALIKPAPAN")
        function findSuffixForLabel(label) {
            const statusMap = window._depoStatus || {};
            const achMap    = window._depoAchMap  || {};
            for (const [suffix, v] of Object.entries(statusMap)) {
                if ((v.label || '') === label) return suffix;
            }
            for (const [suffix, v] of Object.entries(achMap)) {
                if ((v.label || '') === label) return suffix;
            }
            // Fallback: normalise label → BALIKPAPAN etc.
            return label.trim().toUpperCase().replace(/^DEPO\s+/i, '').replace(/\s+/g, '_');
        }

        async function applyFilter() {
            const selectedTipe = document.getElementById('tipeSalesSelect').value;
            const isSummaryRegional = viewType === 'summary';
            
            // Get salesman selection only if not Summary Regional
            const selectedSalesman = isSummaryRegional ? '' : document.getElementById('salesmanSelect').value;
            
            // If no selection at all, show message
            if (!selectedTipe && !selectedSalesman) {
                document.getElementById('loadingSalesman').style.display = 'block';
                document.getElementById('loadingSalesman').textContent = '⏳ Pilih Depo untuk melihat data...';
                document.getElementById('tableBodySalesman').innerHTML = '';
                return;
            }

            document.getElementById('loadingSalesman').style.display = 'none';

            // ── SUMMARY REGIONAL: gunakan data per-depo dari JSON masing-masing ──
            if (isSummaryRegional && selectedTipe) {
                // Cek cache terlebih dahulu
                let depoData = (window._depoDataByLabel || {})[selectedTipe];

                if (!depoData) {
                    // Belum ada di cache → fetch on-demand
                    const suffix = findSuffixForLabel(selectedTipe);
                    document.getElementById('loadingSalesman').style.display = 'block';
                    document.getElementById('loadingSalesman').textContent = '⏳ Memuat data ' + selectedTipe + '...';
                    try {
                        const r = await fetch('data_DEPO_' + suffix + '.json');
                        if (r.ok) {
                            const j = await r.json();
                            depoData = j.data || [];
                            if (!window._depoDataByLabel) window._depoDataByLabel = {};
                            window._depoDataByLabel[selectedTipe] = depoData;
                            window._depoDataByLabel[suffix]        = depoData;
                        } else {
                            document.getElementById('loadingSalesman').style.display = 'block';
                            document.getElementById('loadingSalesman').textContent =
                                '⚠️ Data ' + selectedTipe + ' belum tersedia (data_DEPO_' + suffix + '.json tidak ditemukan).';
                            document.getElementById('tableBodySalesman').innerHTML = '';
                            return;
                        }
                    } catch(e) {
                        document.getElementById('loadingSalesman').style.display = 'block';
                        document.getElementById('loadingSalesman').textContent = '❌ Gagal memuat data ' + selectedTipe + ': ' + e.message;
                        document.getElementById('tableBodySalesman').innerHTML = '';
                        return;
                    }
                }

                document.getElementById('loadingSalesman').style.display = 'none';
                console.log('[ByDepo] Rendering', selectedTipe, '— rows:', (depoData || []).length);
                processAndRender('Salesman', depoData || []);
                return;
            }

            // ── PER-DEPO (non-Summary Regional): filter rawData seperti sebelumnya ──
            const filteredData = rawData.filter(row => {
                const rowSalesman = row['Nama Salesman'] || row['nama salesman'] || row.Salesman || row.salesman || '';
                const rowTipe = row['Tipe Sales'] || row['tipe sales'] || row.TipeSales || row.tipesales || '';

                const matchSalesman = !selectedSalesman || rowSalesman === selectedSalesman;
                const matchTipe     = !selectedTipe     || rowTipe === selectedTipe;
                return matchSalesman && matchTipe;
            });
            
            console.log('Filtered data count:', filteredData.length);
            processAndRender('Salesman', filteredData);
        }

        // ========================================
        // PARETO OUTLET FUNCTIONS
        // ========================================
        
        function loadParetoSalesmanList() {
            const salesmanSelect = document.getElementById('paretoSalesmanSelect');
            const salesmenMap = {};

            // Collect all salesmen + tipe from data
            rawData.forEach(row => {
                const salesman = row['Nama Salesman'] || row['nama salesman'] || row.Salesman || row.salesman || '';
                const tipe     = row['Tipe Sales']    || row['tipe sales']    || row.TipeSales || row.tipesales || '';
                if (salesman) salesmenMap[salesman] = tipe || salesmenMap[salesman] || '';
            });

            // Sort and populate with data-tipe attribute
            Object.keys(salesmenMap).sort().forEach(salesman => {
                const option = document.createElement('option');
                option.value = salesman;
                option.textContent = salesman;
                option.dataset.tipe = salesmenMap[salesman];
                salesmanSelect.appendChild(option);
            });

            console.log('Loaded Pareto salesmen:', Object.keys(salesmenMap).length);
        }
        
        function filterPareto() {
            const salesmanSelect  = document.getElementById('paretoSalesmanSelect');
            const selectedSalesman = salesmanSelect.value;
            const tipeSpan        = document.getElementById('paretoTipeSales');
            const loading         = document.getElementById('loadingPareto');
            const wrap            = document.getElementById('paretoTableWrap');

            // Tampilkan Tipe Salesman
            if (selectedSalesman && salesmanSelect.selectedIndex > 0) {
                const tipe = salesmanSelect.options[salesmanSelect.selectedIndex].dataset.tipe || '';
                tipeSpan.textContent = tipe ? 'Tipe: ' + tipe : '';
            } else {
                tipeSpan.textContent = '';
            }

            if (!selectedSalesman) {
                loading.style.display = 'none';
                // All Salesman: aggregate semua salesman, ambil top 30 by BE
                const customerMap = {};
                rawData.forEach(row => {
                    const key = row['Nama Pelanggan'] || row['Customer'] || row.Pelanggan || 'Unknown';
                    if (!customerMap[key]) {
                        customerMap[key] = {
                            nama: key,
                            hari: row['Hari Kunj'] || row['JKS'] || '',
                            channel: row['CC1'] || row['Channel'] || '',
                            salesman: row['Nama Salesman'] || '',
                            LY: 0, L3M: 0, LM: 0, MTD: 0, BP: 0, BE: 0
                        };
                    }
                    customerMap[key].LY  += parseFloat(row.LY  || 0);
                    customerMap[key].L3M += parseFloat(row.L3M || 0);
                    customerMap[key].LM  += parseFloat(row.LM  || 0);
                    customerMap[key].MTD += parseFloat(row.MTD || row.Act || 0);
                    customerMap[key].BP  += parseFloat(row.BP  || 0);
                    customerMap[key].BE  += parseFloat(row.BE  || 0);
                });
                const top30 = Object.values(customerMap)
                    .sort((a, b) => b.BE - a.BE)
                    .slice(0, 30);
                renderParetoTable(top30);
                return;
            }

            loading.style.display = 'none';

            // Aggregate by customer for selected salesman
            const customerMap = {};
            rawData.forEach(row => {
                const rowSalesman = row['Nama Salesman'] || row['nama salesman'] || row.Salesman || '';
                if (rowSalesman !== selectedSalesman) return;

                const key = row['Nama Pelanggan'] || row['Customer'] || row.Pelanggan || 'Unknown';
                if (!customerMap[key]) {
                    customerMap[key] = {
                        nama: key,
                        hari: row['Hari Kunj'] || row['JKS'] || '',
                        channel: row['CC1'] || row['Channel'] || '',
                        LY: 0, L3M: 0, LM: 0, MTD: 0, BP: 0, BE: 0
                    };
                }
                customerMap[key].LY  += parseFloat(row.LY  || 0);
                customerMap[key].L3M += parseFloat(row.L3M || 0);
                customerMap[key].LM  += parseFloat(row.LM  || 0);
                customerMap[key].MTD += parseFloat(row.MTD || row.Act || 0);
                customerMap[key].BP  += parseFloat(row.BP  || 0);
                customerMap[key].BE  += parseFloat(row.BE  || 0);
            });

            // Sort by BE descending, take top 30
            const top30 = Object.values(customerMap)
                .sort((a, b) => b.BE - a.BE)
                .slice(0, 30);

            renderParetoTable(top30);
        }

        function renderParetoTable(data) {
            const wrap = document.getElementById('paretoTableWrap');

            const fc = (n) => {
                const v = Math.abs(n) / 1000000;
                if (v === 0) return '0';
                return (v >= 1000 ? v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v.toFixed(1)) + 'jt';
            };

            const fpct = (v) => v === 0 ? '-' : v.toFixed(1) + '%';

            const achBadge = (pct) => {
                const cls = pct >= 100 ? 'p-ach-h' : pct >= 80 ? 'p-ach-m' : 'p-ach-l';
                return `<span class="${cls}">${pct.toFixed(1)}%</span>`;
            };

            const gapFmt = (v) => {
                const cls = v >= 0 ? 'p-gap-pos' : 'p-gap-neg';
                const sign = v >= 0 ? '+' : '';
                return `<span class="${cls}">${sign}${fc(v)}</span>`;
            };

            // Totals
            let tLY=0, tL3M=0, tLM=0, tMTD=0, tBP=0, tBE=0;
            data.forEach(r => { tLY+=r.LY; tL3M+=r.L3M; tLM+=r.LM; tMTD+=r.MTD; tBP+=r.BP; tBE+=r.BE; });
            const tGapBP = tMTD - tBP;
            const tGapBE = tMTD - tBE;
            const tAchBP = tBP > 0 ? tMTD/tBP*100 : 0;
            const tAchBE = tBE > 0 ? tMTD/tBE*100 : 0;

            let html = `
            <table>
                <thead>
                    <tr class="pareto-section-header">
                        <th colspan="13">🏆 Top 30 Pareto Outlet - All Principle</th>
                    </tr>
                    <tr class="pareto-col-header">
                        <th class="p-center" style="width:52px;">Rank</th>
                        <th class="p-left"   style="min-width:170px;">Nama Pelanggan</th>
                        <th class="p-center" style="width:80px;">Hari</th>
                        <th class="p-right"  style="width:80px;">BE (Target)</th>
                        <th class="p-right"  style="width:80px;">BP</th>
                        <th class="p-right"  style="width:80px;">MTD (Aktual)</th>
                        <th class="p-right"  style="width:80px;">Gap vs BE</th>
                        <th class="p-right"  style="width:80px;">Gap vs BP</th>
                        <th class="p-center" style="width:70px;">Ach% BE</th>
                        <th class="p-center" style="width:70px;">Ach% BP</th>
                        <th class="p-right"  style="width:75px;">LM</th>
                        <th class="p-right"  style="width:75px;">L3M</th>
                        <th class="p-right"  style="width:75px;">LY</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="pareto-total">
                        <td class="p-center">—</td>
                        <td class="p-left"><strong>TOTAL (Top 30)</strong></td>
                        <td class="p-center">—</td>
                        <td class="p-right"><strong>${fc(tBE)}</strong></td>
                        <td class="p-right"><strong>${fc(tBP)}</strong></td>
                        <td class="p-right"><strong>${fc(tMTD)}</strong></td>
                        <td class="p-right">${gapFmt(tGapBE)}</td>
                        <td class="p-right">${gapFmt(tGapBP)}</td>
                        <td class="p-center">${achBadge(tAchBE)}</td>
                        <td class="p-center">${achBadge(tAchBP)}</td>
                        <td class="p-right"><strong>${fc(tLM)}</strong></td>
                        <td class="p-right"><strong>${fc(tL3M)}</strong></td>
                        <td class="p-right"><strong>${fc(tLY)}</strong></td>
                    </tr>`;

            data.forEach((r, i) => {
                const gapBE = r.MTD - r.BE;
                const gapBP = r.MTD - r.BP;
                const achBE = r.BE > 0 ? r.MTD/r.BE*100 : 0;
                const achBP = r.BP > 0 ? r.MTD/r.BP*100 : 0;
                // Strip "[N]" prefix from Hari Kunj e.g. "[1]SENIN" → "SENIN"
                const hari = (r.hari || '').replace(/^\[\d+\]/, '').trim();

                html += `
                    <tr>
                        <td class="p-center"><span class="pareto-rank-badge">#${i+1}</span></td>
                        <td class="p-left"><strong style="font-size:12px;">${r.nama}</strong><br><small style="color:#94a3b8;font-size:10px;">${r.channel}</small></td>
                        <td class="p-center" style="font-size:11px;color:#64748b;">${hari}</td>
                        <td class="p-right">${fc(r.BE)}</td>
                        <td class="p-right">${fc(r.BP)}</td>
                        <td class="p-right" style="font-weight:600;">${fc(r.MTD)}</td>
                        <td class="p-right">${gapFmt(gapBE)}</td>
                        <td class="p-right">${gapFmt(gapBP)}</td>
                        <td class="p-center">${achBadge(achBE)}</td>
                        <td class="p-center">${achBadge(achBP)}</td>
                        <td class="p-right">${fc(r.LM)}</td>
                        <td class="p-right">${fc(r.L3M)}</td>
                        <td class="p-right">${fc(r.LY)}</td>
                    </tr>`;
            });

            html += '</tbody></table>';
            wrap.innerHTML = html;
        }

        // ═══════════════════════════════════════════════════════════════
        // KLASEMEN DEPO — Weighted scoring from bp + proses per depo
        // Bobot: AchSales 60% | %ECIns 15% | %GS 15% | ARColl 10%
        // Cap setiap komponen maks 120% sebelum dikali bobot
        // ═══════════════════════════════════════════════════════════════
        async function renderKlasemenDepo() {
            const wrap = document.getElementById('klasemenWrap');
            const loadEl = document.getElementById('loadingKlasemen');
            if (loadEl) loadEl.style.display = 'block';

            // 1) Ambil daftar depo
            let rawDepos = [];
            try {
                const res = await fetch('depo_list.json');
                if (res.ok) { const dl = await res.json(); rawDepos = dl.depos || []; }
            } catch(e) {}

            if (!rawDepos.length) {
                wrap.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;font-size:13px;">❌ depo_list.json tidak ditemukan atau kosong.</div>';
                return;
            }

            // 2) Fetch bp + proses semua depo secara paralel
            const fetchSafe = async (url) => {
                try { const r = await fetch(url); return r.ok ? await r.json() : null; }
                catch(e) { return null; }
            };

            // Fetch Master_GS.json untuk digunakan di semua depo
            const masterGsJson = await fetchSafe('Master_GS.json');
            const getQuarterGsTargetPct = () => {
                const month = new Date().getMonth() + 1;
                if (month >= 4 && month <= 6) return 10;   // Q2 target 10%
                if (month >= 7 && month <= 9) return 12;   // Q3 target 12%
                if (month >= 10 && month <= 12) return 18;  // Q4 target 18%
                return 10; // Default jika sebelum Q2 atau data di luar jangkauan
            };
            const getPerDepoGsTargetPct = (row) => {
                if (!row) return null;
                const targets = [
                    'TargetPct','Target %','TARGET_PCT','TARGET PCT','GS Target','TARGET_GS','TargetGS','Target','T.GS Target','TGS Target'
                ];
                for (const key of targets) {
                    if (row[key] != null && row[key] !== '') {
                        const num = Number(row[key]);
                        if (!isNaN(num)) return num;
                    }
                }
                return null;
            };

            const depoEntries = await Promise.all(rawDepos.map(async (rawDepo) => {
                const suffix    = String(rawDepo).trim().toUpperCase().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_');
                const label     = String(rawDepo).trim().replace(/^DEPO\s+/i,'');

                const [bpJson, prosesJson] = await Promise.all([
                    fetchSafe('bp_DEPO_'     + suffix + '.json'),
                    fetchSafe('proses_DEPO_' + suffix + '.json'),
                ]);

                // --- Ach Sales dari bp (abaikan LIQUID MILK) ---
                let mtd = 0, tbp = 0;
                if (bpJson && bpJson.data) {
                    bpJson.data.forEach(r => {
                        // Abaikan baris dengan PwC_Grp3 = LIQUID MILK
                        if (r.PwC_Grp3 && r.PwC_Grp3.trim().toUpperCase() === 'LIQUID MILK') return;
                        
                        // Abaikan jika Principle = QI
                        if (r.Principle && r.Principle.trim().toUpperCase() === 'QI') return;

                        mtd += Number(r.MTD    || 0);
                        tbp += Number(r['T.BP']|| 0);
                    });
                }
                const achSalesRaw = tbp > 0 ? (mtd / tbp * 100) : 0;

                // --- %ECIns, %GS, ARColl dari proses (avg semua salesman) ---
                let ecInsRaw = 0, gsRaw = 0, arCollRaw = 0;
                let hasProsesData = false;
                if (prosesJson && prosesJson.data && prosesJson.data.length > 0) {
                    const rows = prosesJson.data;
                    const avgOf = (key) => {
                        const vals = rows.map(r => r[key]).filter(v => v != null && !isNaN(v));
                        return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
                    };
                    ecInsRaw   = avgOf('%ECIns') * 100;   // decimal → pct
                    arCollRaw  = avgOf('ARColl') * 100;
                    
                    // T.GS = target GS per depo dari Master_GS.json
                    let tgsValue = 0;
                    if (masterGsJson && masterGsJson.data) {
                        const depoCleaned = label
                            .toUpperCase()
                            .replace(/^DEPO\s+/i,'');
                        const masterRow = masterGsJson.data.find(r => {
                            const masterDepo = (r['Nama Depo'] || r.Nama_Dep || r.Depo || r.depo || '')
                                .toString()
                                .trim()
                                .toUpperCase()
                                .replace(/^DEPO\s+/i,'');

                            return masterDepo === depoCleaned;
                        });
                        tgsValue = masterRow ? Number(masterRow['T.GS'] || masterRow['TGS'] || 0) : 0;
                    }
                    
                    // Hitung total A_GS actual dari proses_DEPO
                    let totalAGS = 0;
                    rows.forEach(r => {
                        totalAGS += Number(r['A_GS'] || r.A_GS || 0);
                    });
                    
                    // Hitung %GS = (Actual GS / Target GS) / targetKuartal
                    const rawGsRatio = (tgsValue > 0)
                        ? ((totalAGS / tgsValue) * 100)
                        : 0;

                    const gsTargetPct = getQuarterGsTargetPct();

                    gsRaw = (gsTargetPct > 0)
                        ? ((rawGsRatio / gsTargetPct) * 100)
                        : 0;
                    
                    hasProsesData = true;
                }

                const hasBpData = tbp > 0;

                // --- Cap max 120% ---
                const cap = v => Math.min(v, 120);
                const achSalesCapped = cap(achSalesRaw);
                const ecInsCapped    = cap(ecInsRaw);
                const gsCapped       = cap(gsRaw);
                const arCollCapped   = cap(arCollRaw);

                // --- Weighted score ---
                const score = (hasBpData || hasProsesData)
                    ? achSalesCapped * 0.60 + ecInsCapped * 0.15 + gsCapped * 0.15 + arCollCapped * 0.10
                    : 0;

                return {
                    label, suffix,
                    hasBpData, hasProsesData,
                    achSalesRaw, ecInsRaw, gsRaw, arCollRaw,
                    achSalesCapped, ecInsCapped, gsCapped, arCollCapped,
                    score,
                    mtd, tbp,
                    available: hasBpData || hasProsesData,
                };
            }));

            // 3) Sort: available first by score desc, then unavailable
            depoEntries.sort((a, b) => {
                if (a.available && !b.available) return -1;
                if (!a.available && b.available) return  1;
                return b.score - a.score;
            });

            // 4) Helpers
            const fmtPct  = v => (v == null || isNaN(v)) ? '—' : v.toFixed(1) + '%';
            const colScore = s => '#1e293b';
            const clsScore = s => 'kls-score-hi';
            const barColor = v => '#94a3b8';
            const wgtBg    = v => '#f1f5f9';
            const wgtCol   = v => '#475569';
            const accentColor = (rank, total) => '#e2e8f0';
            const rankBadgeCls = (rank, total) => {
                if (rank === 1) return 'kls-rank-1';   // Gold
                if (rank === 2) return 'kls-rank-2';   // Green
                if (rank === 3) return 'kls-rank-3';   // Silver
                return 'kls-rank-n';                   // Red (rank 4 dan seterusnya)
            };

            const fmtJt = (n) => {
                if (!n) return '0';
                const v = Math.abs(n)/1e6;
                return v >= 1 ? v.toFixed(1)+' jt' : (Math.abs(n)/1e3).toFixed(0)+' rb';
            };

            const availList = depoEntries.filter(d => d.available);
            const total     = availList.length;

            // 5) Render
            const metricDefs = [
                { key: 'achSales', label: 'Ach Sales', bobot: 60,
                  getRaw: d=>d.achSalesRaw, getCapped: d=>d.achSalesCapped,
                  color: '#475569', desc: 'MTD/T.BP' },
                { key: 'ecIns',    label: '%ECIns',             bobot: 15,
                  getRaw: d=>d.ecInsRaw,    getCapped: d=>d.ecInsCapped,
                  color: '#64748b', desc: 'EC Insentif' },
                { key: 'gs',       label: '%GS',                bobot: 15,
                  getRaw: d=>d.gsRaw,       getCapped: d=>d.gsCapped,
                  color: '#64748b', desc: 'Green Store' },
                { key: 'arColl',   label: 'AR Collection',      bobot: 10,
                  getRaw: d=>d.arCollRaw,   getCapped: d=>d.arCollCapped,
                  color: '#64748b', desc: 'AR Coll' },
            ];

            let headerHtml = `
            <div class="kls-header">
                <div>
                    <div class="kls-header-title">🏆 Klasemen Depo — ${total} Depo</div>
                    <div class="kls-header-sub">Skor tertimbang dari data bp_DEPO + proses_DEPO · Cap maks 120%</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <div class="kls-bobot-pills">
                        ${metricDefs.map(m =>
                            `<div class="kls-bobot-pill">
                                <span class="kls-bobot-dot" style="background:${m.color};"></span>
                                ${m.label} <strong>${m.bobot}%</strong>
                            </div>`
                        ).join('')}
                    </div>
                    <button onclick="saveKlasemenImage(this)"
                        style="padding:6px 14px;background:white;border:1.5px solid #2563eb;color:#2563eb;
                               border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;
                               display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0;">
                        🖼️ Save PNG
                    </button>
                </div>
            </div>`;

            let cardsHtml = '<div class="kls-grid">';

            let rank = 0;
            depoEntries.forEach((d) => {
                if (d.available) rank++;
                const rankDisplay = d.available ? rank : '—';
                const badgeCls    = d.available ? rankBadgeCls(rank, total) : 'kls-rank-n';
                const accent      = d.available ? accentColor(rank, total)  : '#cbd5e1';
                const scoreDisp   = d.available ? d.score.toFixed(1) + '%'  : '—';
                const scoreCls    = d.available ? clsScore(d.score)          : 'kls-score-low';
                const cardCls     = d.available ? 'kls-card' : 'kls-card kls-missing';

                let metricsHtml = metricDefs.map(m => {
                    const rawV    = m.getRaw(d);
                    const cappedV = m.getCapped(d);
                    const isCapped = rawV > 120;
                    const kontribusi = cappedV * m.bobot / 100;
                    const achCls  = !d.available ? 'ach-red'
                                  : rawV >= 100  ? 'ach-green'
                                  : rawV >= 90   ? 'ach-yellow'
                                  : 'ach-red';

                    return `
                    <div class="kls-metric-row">
                        <span class="kls-metric-lbl">${m.label} <span class="kls-bobot-tag">${m.bobot}%</span>${isCapped ? ' <span class="kls-capped-tag">cap</span>' : ''}</span>
                        <div class="kls-metric-vals">
                            <span class="kls-metric-raw ${achCls}">${d.available ? fmtPct(rawV) : '—'}</span>
                            <span class="kls-metric-wgt">+${d.available ? kontribusi.toFixed(1) : '0'}</span>
                        </div>
                    </div>`;
                }).join('');

                const achBP = d.tbp > 0 ? (d.mtd / d.tbp * 100).toFixed(1) + '%' : '—';

                // Foto kepala cabang — nama file: foto/DEPO_SUFFIX.png (misal foto/PALANGKARAYA.png)
                const photoSrc  = `foto/DEPO_${d.suffix}.png`;
                const photoHtml = `
                    <div class="kls-photo-wrap">
                        <img src="${photoSrc}" alt="${d.label}"
                             onerror="this.parentElement.innerHTML='<span class=\\'kls-photo-placeholder\\'>👤</span>'"
                             style="width:100%;height:100%;object-fit:cover;">
                    </div>`;

                cardsHtml += `
                <div class="${cardCls}">
                    <div class="kls-card-top">
                        <div class="kls-rank-badge ${badgeCls}">${rankDisplay}</div>
                        <div class="kls-depo-info">
                            <div class="kls-depo-name">${d.label}</div>
                            <div class="kls-depo-sub">
                                MTD ${fmtJt(d.mtd)} / BP ${fmtJt(d.tbp)}
                                ${d.available ? '' : '· <em>Data belum tersedia</em>'}
                            </div>
                        </div>
                        <div class="kls-score-wrap">
                            <div class="kls-score-val ${scoreCls}">${scoreDisp}</div>
                            <div class="kls-score-lbl">Total Score</div>
                        </div>
                    </div>
                    <div class="kls-divider"></div>
                    <div class="kls-card-body">
                        ${photoHtml}
                        <div class="kls-metrics">
                            ${metricsHtml}
                        </div>
                    </div>
                </div>`;
            });

            cardsHtml += '</div>';

            if (loadEl) loadEl.style.display = 'none';
            wrap.innerHTML = headerHtml + cardsHtml;
            window._klasemenLoaded = true;
        }

        function processSummaryByDepo() {
            const weeks = WEEKS_CONFIG.length > 0 ? WEEKS_CONFIG : ['W1', 'W2', 'W3', 'W4', 'MTD'];
            
            // Group by Depo
            const depoGroups = {};
            
            rawData.forEach(row => {
                const depo = row.Depo || 'Unknown';
                
                if (!depoGroups[depo]) {
                    depoGroups[depo] = [];
                }
                depoGroups[depo].push(row);
            });
            
            // Aggregate each depo
            const depoResults = {};
            Object.keys(depoGroups).forEach(depo => {
                depoResults[depo] = aggregateData(depoGroups[depo], weeks);
            });
            
            // Sort by %BP MTD (highest first)
            const sortedDepos = Object.keys(depoResults).sort((a, b) => {
                const aBP = depoResults[a]['MTD'].BP || 0;
                const aAct = depoResults[a]['MTD'].Actual || 0;
                const aPct = aBP > 0 ? (aAct / aBP * 100) : 0;
                
                const bBP = depoResults[b]['MTD'].BP || 0;
                const bAct = depoResults[b]['MTD'].Actual || 0;
                const bPct = bBP > 0 ? (bAct / bBP * 100) : 0;
                
                return bPct - aPct; // Descending (highest first)
            });
            
            // Create sorted results with ranking
            const sortedResults = {};
            sortedDepos.forEach((depo, index) => {
                sortedResults[depo] = depoResults[depo];
                sortedResults[depo].rank = index + 1; // Add rank (1, 2, 3, ...)
            });
            
            // Render table
            renderSummaryTable(sortedResults, weeks, 'Depo', sortedDepos);
        }
        
        function processSummaryByTipe() {
            const weeks = WEEKS_CONFIG.length > 0 ? WEEKS_CONFIG : ['W1', 'W2', 'W3', 'W4', 'MTD'];
            
            // Group by Tipe Sales
            const tipeGroups = {};
            
            rawData.forEach(row => {
                const tipe = row['Tipe Sales'] || row['tipe sales'] || 'Unknown';
                
                if (!tipeGroups[tipe]) {
                    tipeGroups[tipe] = [];
                }
                tipeGroups[tipe].push(row);
            });
            
            // Aggregate each tipe
            const tipeResults = {};
            const sortedTipes = Object.keys(tipeGroups).sort();
            sortedTipes.forEach(tipe => {
                tipeResults[tipe] = aggregateData(tipeGroups[tipe], weeks);
            });
            
            // Render table
            renderSummaryTable(tipeResults, weeks, 'Tipe', sortedTipes);
        }
        
        function aggregateData(rows, weeks) {
            const result = {};
            weeks.forEach(w => {
                result[w] = { CR: new Set(), CA: new Set(), LY: 0, LM: 0, L3M: 0, BE: 0, BP: 0, Actual: 0 };
            });
            rows.forEach(row => {
                weeks.forEach(w => {
                    const wNum = w.replace('W', '').replace('MTD', '');
                    const isMTD = w === 'MTD';
                    const idPelanggan = row['Id Pelanggan'] || row['ID Pelanggan'] || '';
                    if (idPelanggan) result[w].CR.add(idPelanggan);
                    if (idPelanggan && Number(row.CA || 0) > 0) result[w].CA.add(idPelanggan);
                    result[w].LY     += Number(row[isMTD ? 'LY'  : `LYW${wNum}`]  || 0);
                    result[w].LM     += Number(row[isMTD ? 'LM'  : `LMW${wNum}`]  || 0);
                    result[w].L3M    += Number(row.L3M || row.l3m || 0);
                    result[w].BE     += Number(row[isMTD ? 'BE'  : `BEW${wNum}`]  || 0);
                    result[w].BP     += Number(row[isMTD ? 'BP'  : `BPW${wNum}`]  || 0);
                    result[w].Actual += Number(row[isMTD ? 'MTD' : `MTDW${wNum}`] || 0);
                });
            });
            weeks.forEach(w => {
                result[w].CR = result[w].CR.size;
                result[w].CA = result[w].CA.size;
            });
            return result;
        }
        
        function renderSummaryTable(results, weeks, tableType, sortedKeys = null) {
            let html = '';
            
            const keys = sortedKeys || Object.keys(results);
            
            keys.forEach(key => {
                const rank = results[key].rank || 0;
                let medalIcon = '';
                
                // Add medal icons for By Depo table
                if (tableType === 'Depo') {
                    if (rank === 1) medalIcon = '🥇 ';
                    else if (rank === 2) medalIcon = '🥈 ';
                    else if (rank === 3) medalIcon = '🥉 ';
                }
                
                html += `<tr><td class="sticky-col row-channel">${medalIcon}${key}</td>`;
                weeks.forEach(w => html += renderCells(results[key][w], w === 'MTD', w));
                html += '</tr>';
            });
            
            const bodyId = tableType === 'Depo' ? 'tableBodySummaryDepo' : 'tableBodySummaryTipe';
            document.getElementById(bodyId).innerHTML = html;
        }

        // CC3 → Kategori mapping
        const CC3_SCHOOL_MAP = {
            'DIDALAM SEKOLAH': 'School',
            'DISEKITAR LINGKUNGAN SEKOLAH': 'School',
            'BADAN USAHA': 'Non School',
            'PASAR': 'Non School',
            'PERUMAHAN': 'Non School',
            'TRANSPORTASI': 'Non School'
        };
        function getCC3Kategori(cc3) {
            return CC3_SCHOOL_MAP[(cc3 || '').toUpperCase().trim()] || 'Non School';
        }
        function makeEmptyBucket() {
            return { CR: new Set(), CA: new Set(), LY: 0, LM: 0, L3M: 0, BE: 0, BP: 0, Actual: 0 };
        }

        function processAndRender(target, dataToProcess = null) {
            const weeks = WEEKS_CONFIG.length > 0 ? WEEKS_CONFIG : ['W1', 'W2', 'W3', 'W4', 'MTD'];
            const data = dataToProcess || rawData;
            
            const channels = {
                'WHOLESALER': ['SPRBIG', 'BIG', 'MEDIUM', 'SMALL'],
                'RETAIL': ['SPRBIG', 'BIG', 'MEDIUM', 'SMALL'],
                'MT': [],
                'NKA': [],
                'MTI': [],
                'INSTITUTION': [],
                'FS': []
            };

            const result = {};
            weeks.forEach(w => {
                result[w] = {};
                Object.keys(channels).forEach(ch => {
                    result[w][ch] = { CR: new Set(), CA: new Set(), LY: 0, LM: 0, L3M: 0, BE: 0, BP: 0, Actual: 0, classes: {} };
                    channels[ch].forEach(cls => {
                        result[w][ch].classes[cls] = { CR: new Set(), CA: new Set(), LY: 0, LM: 0, L3M: 0, BE: 0, BP: 0, Actual: 0 };
                    });
                });
                // School / Non School buckets — khusus RETAIL
                result[w]['RETAIL'].schoolCats = {
                    'School':     makeEmptyBucket(),
                    'Non School': makeEmptyBucket()
                };
            });

            data.forEach(row => {
                const ch = (row.Channel || row.channel || '').toUpperCase();
                const cls = (row.Clas || row.clas || '').toUpperCase();
                const idPelanggan = row['Id Pelanggan'] || row['ID Pelanggan'] || row.id_pelanggan || '';
                
                if (!channels[ch] && ch !== 'NKA' && ch !== 'MTI') return;

                weeks.forEach(w => {
                    const wNum = w.replace('W', '').replace('MTD', '');
                    const isMTD = w === 'MTD';
                    
                    if (channels[ch]) {
                        if (idPelanggan) result[w][ch].CR.add(idPelanggan);
                        if (idPelanggan && Number(row.CA || 0) > 0) result[w][ch].CA.add(idPelanggan);
                        result[w][ch].LY     += Number(row[isMTD ? 'LY'  : `LYW${wNum}`]  || 0);
                        result[w][ch].LM     += Number(row[isMTD ? 'LM'  : `LMW${wNum}`]  || 0);
                        result[w][ch].L3M    += Number(row.L3M || row.l3m || 0);
                        result[w][ch].BE     += Number(row[isMTD ? 'BE'  : `BEW${wNum}`]  || 0);
                        result[w][ch].BP     += Number(row[isMTD ? 'BP'  : `BPW${wNum}`]  || 0);
                        result[w][ch].Actual += Number(row[isMTD ? 'MTD' : `MTDW${wNum}`] || 0);

                        if (cls && result[w][ch].classes[cls]) {
                            if (idPelanggan) result[w][ch].classes[cls].CR.add(idPelanggan);
                            if (idPelanggan && Number(row.CA || 0) > 0) result[w][ch].classes[cls].CA.add(idPelanggan);
                            result[w][ch].classes[cls].LY     += Number(row[isMTD ? 'LY'  : `LYW${wNum}`]  || 0);
                            result[w][ch].classes[cls].LM     += Number(row[isMTD ? 'LM'  : `LMW${wNum}`]  || 0);
                            result[w][ch].classes[cls].L3M    += Number(row.L3M || row.l3m || 0);
                            result[w][ch].classes[cls].BE     += Number(row[isMTD ? 'BE'  : `BEW${wNum}`]  || 0);
                            result[w][ch].classes[cls].BP     += Number(row[isMTD ? 'BP'  : `BPW${wNum}`]  || 0);
                            result[w][ch].classes[cls].Actual += Number(row[isMTD ? 'MTD' : `MTDW${wNum}`] || 0);
                        }

                        // School / Non School — hanya untuk RETAIL
                        if (ch === 'RETAIL') {
                            const kat = getCC3Kategori(row.CC3 || row.cc3 || '');
                            const bkt = result[w]['RETAIL'].schoolCats[kat];
                            if (idPelanggan) bkt.CR.add(idPelanggan);
                            if (idPelanggan && Number(row.CA || 0) > 0) bkt.CA.add(idPelanggan);
                            bkt.LY     += Number(row[isMTD ? 'LY'  : `LYW${wNum}`]  || 0);
                            bkt.LM     += Number(row[isMTD ? 'LM'  : `LMW${wNum}`]  || 0);
                            bkt.L3M    += Number(row.L3M || row.l3m || 0);
                            bkt.BE     += Number(row[isMTD ? 'BE'  : `BEW${wNum}`]  || 0);
                            bkt.BP     += Number(row[isMTD ? 'BP'  : `BPW${wNum}`]  || 0);
                            bkt.Actual += Number(row[isMTD ? 'MTD' : `MTDW${wNum}`] || 0);
                        }
                        
                        if (ch === 'NKA' || ch === 'MTI') {
                            if (idPelanggan) result[w]['MT'].CR.add(idPelanggan);
                            if (idPelanggan && Number(row.CA || 0) > 0) result[w]['MT'].CA.add(idPelanggan);
                            result[w]['MT'].LY     += Number(row[isMTD ? 'LY'  : `LYW${wNum}`]  || 0);
                            result[w]['MT'].LM     += Number(row[isMTD ? 'LM'  : `LMW${wNum}`]  || 0);
                            result[w]['MT'].L3M    += Number(row.L3M || row.l3m || 0);
                            result[w]['MT'].BE     += Number(row[isMTD ? 'BE'  : `BEW${wNum}`]  || 0);
                            result[w]['MT'].BP     += Number(row[isMTD ? 'BP'  : `BPW${wNum}`]  || 0);
                            result[w]['MT'].Actual += Number(row[isMTD ? 'MTD' : `MTDW${wNum}`] || 0);
                        }
                    }
                });
            });

            // Convert Sets → sizes
            weeks.forEach(w => {
                Object.keys(channels).forEach(ch => {
                    result[w][ch].CR = result[w][ch].CR.size;
                    result[w][ch].CA = result[w][ch].CA.size;
                    Object.keys(result[w][ch].classes).forEach(cls => {
                        result[w][ch].classes[cls].CR = result[w][ch].classes[cls].CR.size;
                        result[w][ch].classes[cls].CA = result[w][ch].classes[cls].CA.size;
                    });
                });
                ['School', 'Non School'].forEach(kat => {
                    const bkt = result[w]['RETAIL'].schoolCats[kat];
                    bkt.CR = bkt.CR.size;
                    bkt.CA = bkt.CA.size;
                });
            });

            renderTable(result, weeks, channels, target);
        }

        // Cek apakah bucket kosong di semua weeks (LY, LM, BE, BP, Actual, CR semuanya 0)
        function isBucketEmpty(bucketFn, weeks) {
            return weeks.every(w => {
                const d = bucketFn(w);
                return !d || (d.LY === 0 && d.LM === 0 && d.BE === 0 && d.BP === 0 && d.Actual === 0 && d.CR === 0);
            });
        }

        function renderTable(result, weeks, channels, target) {
            const hideEmpty = (target === 'Salesman'); // sembunyikan sub-channel kosong di Dashboard by Salesman
            let html = '';

            html += '<tr><td class="sticky-col row-total">GT ext PS</td>';
            weeks.forEach(w => {
                const gt = sumChannels(result[w], ['WHOLESALER', 'RETAIL', 'INSTITUTION', 'FS']);
                html += renderCells(gt, w === 'MTD', w);
            });
            html += '</tr>';

            ['WHOLESALER', 'RETAIL'].forEach(ch => {
                html += `<tr><td class="sticky-col row-channel">${ch}</td>`;
                weeks.forEach(w => html += renderCells(result[w][ch], w === 'MTD', w));
                html += '</tr>';

                channels[ch].forEach(cls => {
                    if (hideEmpty && isBucketEmpty(w => result[w][ch].classes[cls], weeks)) return;
                    html += `<tr><td class="sticky-col row-subitem">${cls}</td>`;
                    weeks.forEach(w => html += renderCells(result[w][ch].classes[cls], w === 'MTD', w));
                    html += '</tr>';
                });

                // Baris School / Non School — hanya untuk RETAIL
                if (ch === 'RETAIL') {
                    ['School', 'Non School'].forEach(kat => {
                        if (hideEmpty && isBucketEmpty(w => result[w]['RETAIL'].schoolCats[kat], weeks)) return;
                        html += `<tr><td class="sticky-col row-school-cat">${kat}</td>`;
                        weeks.forEach(w => html += renderCells(result[w]['RETAIL'].schoolCats[kat], w === 'MTD', w));
                        html += '</tr>';
                    });
                }
            });

            html += `<tr><td class="sticky-col row-mt">MT</td>`;
            weeks.forEach(w => html += renderCells(result[w]['MT'], w === 'MTD', w));
            html += '</tr>';

            // NKA — sembunyikan jika kosong di mode Salesman
            if (!hideEmpty || !isBucketEmpty(w => result[w]['NKA'], weeks)) {
                html += `<tr><td class="sticky-col row-mt-sub">NKA</td>`;
                weeks.forEach(w => html += renderCells(result[w]['NKA'], w === 'MTD', w));
                html += '</tr>';
            }

            // MTI — sembunyikan jika kosong di mode Salesman
            if (!hideEmpty || !isBucketEmpty(w => result[w]['MTI'], weeks)) {
                html += `<tr><td class="sticky-col row-mt-sub">MTI</td>`;
                weeks.forEach(w => html += renderCells(result[w]['MTI'], w === 'MTD', w));
                html += '</tr>';
            }

            ['INSTITUTION', 'FS'].forEach(ch => {
                html += `<tr><td class="sticky-col row-channel">${ch}</td>`;
                weeks.forEach(w => html += renderCells(result[w][ch], w === 'MTD', w));
                html += '</tr>';
            });

            html += '<tr><td class="sticky-col row-total">ALL Channel Exc. NKA</td>';
            weeks.forEach(w => {
                const all = sumChannels(result[w], ['WHOLESALER', 'RETAIL', 'MTI', 'INSTITUTION', 'FS']);
                html += renderCells(all, w === 'MTD', w);
            });
            html += '</tr>';

            html += '<tr><td class="sticky-col row-total">ALL Channel</td>';
            weeks.forEach(w => {
                const all = sumChannels(result[w], ['WHOLESALER', 'RETAIL', 'NKA', 'MTI', 'INSTITUTION', 'FS']);
                html += renderCells(all, w === 'MTD', w);
            });
            html += '</tr>';

            document.getElementById(`tableBody${target}`).innerHTML = html;
        }

        function sumChannels(weekData, chList) {
            const sum = { CR: 0, CA: 0, LY: 0, LM: 0, L3M: 0, BE: 0, BP: 0, Actual: 0 };
            chList.forEach(ch => {
                sum.CR += weekData[ch].CR;
                sum.CA += weekData[ch].CA;
                sum.LY += weekData[ch].LY;
                sum.LM += weekData[ch].LM;
                sum.L3M += weekData[ch].L3M;
                sum.BE += weekData[ch].BE;
                sum.BP += weekData[ch].BP;
                sum.Actual += weekData[ch].Actual;
            });
            return sum;
        }

        function renderCells(d, isMTD, wStr) {
            const wNum = (wStr && wStr !== 'MTD') ? wStr.replace('W','') : '';
            const caVsCR = d.CR > 0 ? (d.CA / d.CR * 100).toFixed(1) : '0.0';
            const vsBP = d.BP > 0 ? (d.Actual / d.BP * 100).toFixed(1) : '0.0';
            const gapBP = d.Actual - d.BP;
            const vsBE = d.BE > 0 ? (d.Actual / d.BE * 100).toFixed(1) : '0.0';
            const gapBE = d.Actual - d.BE;
            
            // Updated: < 90% red, 90-99.99% yellow, >= 100% green
            const bpClass = vsBP >= 100 ? 'cell-green' : (vsBP >= 90 ? 'cell-yellow' : 'cell-red');
            const beClass = vsBE >= 100 ? 'cell-green' : (vsBE >= 90 ? 'cell-yellow' : 'cell-red');
            
            const gapBPFmt = gapBP > 0 
                ? `<span class="pos">+${fmtM(gapBP)}</span>` 
                : `<span class="neg">${fmtM(gapBP)}</span>`;
            const gapBEFmt = gapBE > 0 
                ? `<span class="pos">+${fmtM(gapBE)}</span>` 
                : `<span class="neg">${fmtM(gapBE)}</span>`;
            
            if (!isMTD) {
                const dw = wNum ? ` data-w="${wNum}"` : '';
                // Check if this week is currently hidden, apply class if so
                const hidCls = (window._wkColsState && window._wkColsState[wNum]) ? ' wk-hidden' : '';
                return `<td class="wk-detail${hidCls}" data-col="ly"${dw}>${fmtM(d.LY)}</td><td class="wk-detail${hidCls}" data-col="lm"${dw}>${fmtM(d.LM)}</td><td class="wk-detail${hidCls}" data-col="be"${dw}>${fmtM(d.BE)}</td><td class="wk-detail${hidCls}" data-col="bp"${dw}>${fmtM(d.BP)}</td>` +
                       `<td class="wk-detail${hidCls}" data-col="act"${dw}>${fmtM(d.Actual)}</td>` +
                       `<td class="wk-result ${bpClass}" data-col="pct-bp">${vsBP}%</td><td class="wk-result" data-col="gap-bp">${gapBPFmt}</td>` +
                       `<td class="wk-result ${beClass}" data-col="pct-be">${vsBE}%</td><td class="wk-result" data-col="gap-be">${gapBEFmt}</td>`;
            }
            
            return `<td class="wk-mtd-cell">${fmtN(d.CR)}</td><td class="wk-mtd-cell">${fmtN(d.CA)}</td><td class="wk-mtd-cell">${caVsCR}%</td>` +
                   `<td class="wk-mtd-cell">${fmtM(d.LY)}</td><td class="wk-mtd-cell">${fmtM(d.LM)}</td><td class="wk-mtd-cell">${fmtM(d.L3M)}</td>` +
                   `<td class="wk-mtd-cell">${fmtM(d.BE)}</td><td class="wk-mtd-cell">${fmtM(d.BP)}</td>` +
                   `<td class="wk-mtd-cell">${fmtM(d.Actual)}</td>` +
                   `<td class="wk-mtd-cell ${bpClass}">${vsBP}%</td><td class="wk-mtd-cell">${gapBPFmt}</td>` +
                   `<td class="wk-mtd-cell ${beClass}">${vsBE}%</td><td class="wk-mtd-cell">${gapBEFmt}</td>`;
        }

        function fmtN(n) {
            return Math.round(n || 0).toLocaleString('id-ID');
        }

        function fmtM(n) {
            const m = (n || 0) / 1000000;
            if (Math.abs(m) >= 1000) {
                return m.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            }
            return m.toFixed(1);
        }

        // ===== PROJECT TAB FUNCTIONS =====

        async function loadProjectData() {
            const loading = document.getElementById('loadingProject');
            const wrap = document.getElementById('projTableWrap');
            loading.style.display = 'block';
            loading.textContent = '⏳ Memuat data Project...';
            wrap.innerHTML = '';
            try {
                if (viewType === 'summary') {
                    // Regional: fetch semua project_DEPO_xxx.json secara paralel
                    loading.textContent = '⏳ Memuat data Project semua depo...';
                    const depoRes  = await fetch('depo_list.json');
                    const depoData = await depoRes.json();
                    const results  = await Promise.all((depoData.depos||[]).map(async depo => {
                        const suffix = depo.toUpperCase().trim().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_');
                        const label  = depo.trim().replace(/^DEPO\s+/i,'');
                        try {
                            const r = await fetch('project_DEPO_' + suffix + '.json');
                            if (!r.ok) return [];
                            const j = await r.json();
                            // Tag setiap row dengan nama depo jika belum ada
                            return (j.data||[]).map(row => ({ ...row, Depo: row.Depo || label }));
                        } catch(e) { return []; }
                    }));
                    projectData = results.flat();
                } else {
                    const depoSuffix = selectedDepo.replace('data_DEPO_', '');
                    const projectFile = `project_DEPO_${depoSuffix}.json`;
                    const res = await fetch(projectFile);
                    if (!res.ok) throw new Error(`${projectFile} tidak ditemukan`);
                    const json = await res.json();
                    projectData = json.data || [];
                }
                if (!projectData.length) {
                    loading.textContent = '⚠️ Tidak ada data Project.';
                    return;
                }
                loading.style.display = 'none';
                renderProjectTab();
            } catch(e) {
                loading.textContent = '❌ Gagal memuat data Project: ' + e.message;
            }
        }

        function renderProjectTab() {
            if (!projectData || projectData.length === 0) return;

            const fc = (n) => {
                if (n === null || n === undefined || isNaN(n)) return '-';
                const v = Math.abs(n) / 1000000;
                if (v === 0) return '0';
                return (v >= 1000 ? v.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : v.toFixed(1)) + 'jt';
            };

            const fpct = (v) => {
                if (v === null || v === undefined || isNaN(v)) return '-';
                const pct = v * 100;
                return pct.toFixed(1) + '%';
            };

            const achBadge = (pct) => {
                const cls = pct >= 100 ? 'p-ach-h' : pct >= 80 ? 'p-ach-m' : 'p-ach-l';
                return `<span class="${cls}">${pct.toFixed(1)}%</span>`;
            };

            const gapFmt = (v) => {
                if (v === null || isNaN(v)) return '-';
                const cls = v >= 0 ? 'p-gap-pos' : 'p-gap-neg';
                const sign = v >= 0 ? '+' : '';
                return `<span class="${cls}">${sign}${fc(v)}</span>`;
            };

            // ---- Group by Project name ----
            const projectGroups = {};
            projectData.forEach(r => {
                const proj = r['Project'] || 'Unknown';
                if (!projectGroups[proj]) projectGroups[proj] = [];
                projectGroups[proj].push(r);
            });

            const projectNames = Object.keys(projectGroups).sort();

            // ---- Build metric cards: one per project showing Ach% MTD ----
            const metricsRow = document.getElementById('projectMetricsRow');
            metricsRow.innerHTML = '';
            projectNames.forEach(proj => {
                const rows = projectGroups[proj];
                let tTMtd = 0, tAMtd = 0;
                rows.forEach(r => {
                    tTMtd += parseFloat(r['T.MTD'] || 0);
                    tAMtd += parseFloat(r['A.MTD'] || 0);
                });
                const achMtdPct = tTMtd > 0 ? tAMtd / tTMtd * 100 : 0;
                const colorClass = achMtdPct >= 100 ? 'green' : achMtdPct >= 80 ? 'orange' : 'red';
                const valueClass = achMtdPct >= 100 ? 'ach-high' : achMtdPct >= 80 ? 'ach-mid' : 'ach-low';

                const card = document.createElement('div');
                card.className = `proj-metric-card ${colorClass}`;
                card.style.cursor = 'pointer';
                card.title = `Klik untuk lihat detail ${proj}`;
                card.onclick = () => switchProjectSubTab(proj);
                const isCs = proj.toUpperCase().includes('SC');
                const fcCard = isCs
                    ? (n) => { const v = Math.round(Number(n||0)); return v === 0 ? '0 cs' : v.toLocaleString('id-ID') + ' cs'; }
                    : fc;
                card.innerHTML = `
                    <div class="proj-metric-label">Ach MTD — ${proj}</div>
                    <div class="proj-metric-value ${valueClass}">${achMtdPct.toFixed(1)}%</div>
                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${rows.length} outlet · ${fcCard(tAMtd)} / ${fcCard(tTMtd)}</div>
                `;
                metricsRow.appendChild(card);
            });

            // ---- Build sub-tabs ----
            const subTabsEl = document.getElementById('projSubTabs');
            subTabsEl.innerHTML = '';
            projectNames.forEach((name, idx) => {
                const tab = document.createElement('div');
                tab.className = 'proj-subtab' + (idx === 0 ? ' active' : '');
                tab.textContent = name;
                tab.onclick = () => switchProjectSubTab(name);
                subTabsEl.appendChild(tab);
            });

            // Store grouped data for rendering
            window._projGroups = projectGroups;
            window._projFc = fc;
            window._projAchBadge = achBadge;
            window._projGapFmt = gapFmt;

            // Render first sub-tab
            if (projectNames.length > 0) {
                window._activeProject = projectNames[0];
                renderProjectTable(projectNames[0]);
                const btn = document.getElementById('btnSaveProject');
                if (btn) btn.style.display = '';
            }
        }

        function switchProjectSubTab(projName) {
            window._activeProject = projName;
            document.querySelectorAll('.proj-subtab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.proj-subtab').forEach(t => {
                if (t.textContent === projName) t.classList.add('active');
            });
            renderProjectTable(projName);
        }

        function renderProjectTable(projName) {
            const wrap = document.getElementById('projTableWrap');
            const rows = (window._projGroups || {})[projName] || [];
            const achBadge = window._projAchBadge;

            // Format angka: ITG SC pakai cs (integer + separator), lainnya pakai jt/rb
            const isCs = projName.toUpperCase().includes('SC');
            const fc = isCs
                ? (n) => {
                    if (n === null || n === undefined || isNaN(n)) return '-';
                    const v = Math.round(Number(n));
                    if (v === 0) return '0 cs';
                    return v.toLocaleString('id-ID') + ' cs';
                  }
                : window._projFc;

            const gapFmt = (v) => {
                if (v === null || isNaN(v)) return '-';
                const cls = v >= 0 ? 'p-gap-pos' : 'p-gap-neg';
                const sign = v >= 0 ? '+' : '';
                return `<span class="${cls}">${sign}${fc(v)}</span>`;
            };

            // Sort by A.QRT descending (Pareto style)
            const sorted = [...rows].sort((a, b) => parseFloat(b['A.QRT'] || 0) - parseFloat(a['A.QRT'] || 0));

            // Totals
            let tTQrt=0, tAQrt=0, tTMtd=0, tAMtd=0, tLY=0, tLM=0, tL3M=0, tGapQrt=0, tGapMtd=0;
            sorted.forEach(r => {
                tTQrt  += parseFloat(r['T.Qrt']   || 0);
                tAQrt  += parseFloat(r['A.QRT']   || 0);
                tTMtd  += parseFloat(r['T.MTD']   || 0);
                tAMtd  += parseFloat(r['A.MTD']   || 0);
                tLY    += parseFloat(r['LY']       || 0);
                tLM    += parseFloat(r['LM']       || 0);
                tL3M   += parseFloat(r['L3M']      || 0);
                tGapQrt+= parseFloat(r['Gap_Qrt']  || 0);
                tGapMtd+= parseFloat(r['Gap_MTD']  || 0);
            });
            const tAchQrt = tTQrt > 0 ? tAQrt / tTQrt * 100 : 0;
            const tAchMtd = tTMtd > 0 ? tAMtd / tTMtd * 100 : 0;

            let html = `
            <table>
                <thead>
                    <tr class="proj-section-header">
                        <th colspan="13">📋 Project: ${projName} — ${sorted.length} Outlet (sorted by Actual QRT)</th>
                    </tr>
                    <tr class="proj-col-header">
                        <th class="p-center" style="width:2px;">Rank</th>
                        <th class="p-left"   style="width:10px;">Nama Pelanggan</th>
                        <th class="p-left"   style="width:50px;">Salesman</th>
                        <th class="p-right"  style="width:30px;">Target QRT</th>
                        <th class="p-right"  style="width:30px;">Actual QRT</th>
                        <th class="p-center" style="width:30px;">Ach% QRT</th>
                        <th class="p-right"  style="width:30px;">Gap QRT</th>
                        <th class="p-right"  style="width:30px;">Target MTD</th>
                        <th class="p-right"  style="width:30px;">Actual MTD</th>
                        <th class="p-center" style="width:30px;">Ach% MTD</th>
                        <th class="p-right"  style="width:30px;">Gap MTD</th>
                        <th class="p-right"  style="width:30px;">LM</th>
                        <th class="p-right"  style="width:30px;">LY</th>
                    </tr>
                    <tr class="proj-total">
                        <td class="p-center">—</td>
                        <td class="p-left"><strong>TOTAL (${sorted.length} Outlet)</strong></td>
                        <td class="p-left">—</td>
                        <td class="p-right"><strong>${fc(tTQrt)}</strong></td>
                        <td class="p-right"><strong>${fc(tAQrt)}</strong></td>
                        <td class="p-center">${achBadge(tAchQrt)}</td>
                        <td class="p-right">${gapFmt(tGapQrt)}</td>
                        <td class="p-right"><strong>${fc(tTMtd)}</strong></td>
                        <td class="p-right"><strong>${fc(tAMtd)}</strong></td>
                        <td class="p-center">${achBadge(tAchMtd)}</td>
                        <td class="p-right">${gapFmt(tGapMtd)}</td>
                        <td class="p-right"><strong>${fc(tLM)}</strong></td>
                        <td class="p-right"><strong>${fc(tLY)}</strong></td>
                    </tr>
                </thead>
                <tbody>`;

            sorted.forEach((r, i) => {
                const achQrt = parseFloat(r['Ach_Qrt'] || 0);
                const achMtd = parseFloat(r['Ach_MTD'] || 0);
                // Data selalu dalam format desimal (0.66 = 66%, 1.6 = 160%), selalu × 100
                const achQrtPct = achQrt * 100;
                const achMtdPct = achMtd * 100;
                html += `
                    <tr>
                        <td class="p-center"><span class="proj-rank-badge">${i+1}</span></td>
                        <td class="p-left"><strong style="font-size:12px;">${r['Nama Pelanggan'] || '-'}</strong><br>
                            <small style="color:#94a3b8;font-size:10px;">${r['Depo'] || ''}</small></td>
                        <td class="p-left" style="font-size:11px;color:#64748b;">${r['Nama Salesman'] || '-'}</td>
                        <td class="p-right">${fc(r['T.Qrt'])}</td>
                        <td class="p-right" style="font-weight:600;">${fc(r['A.QRT'])}</td>
                        <td class="p-center">${achBadge(achQrtPct)}</td>
                        <td class="p-right">${gapFmt(r['Gap_Qrt'])}</td>
                        <td class="p-right">${fc(r['T.MTD'])}</td>
                        <td class="p-right" style="font-weight:600;">${fc(r['A.MTD'])}</td>
                        <td class="p-center">${achBadge(achMtdPct)}</td>
                        <td class="p-right">${gapFmt(r['Gap_MTD'])}</td>
                        <td class="p-right">${fc(r['LM'])}</td>
                        <td class="p-right">${fc(r['LY'])}</td>
                    </tr>`;
            });

            html += '</tbody></table>';
            wrap.innerHTML = html;

            // Auto-calculate sticky top values based on actual rendered heights
            requestAnimationFrame(() => {
                const table = wrap.querySelector('table');
                if (!table) return;
                const secRow = table.querySelector('tr.proj-section-header');
                const colRow = table.querySelector('tr.proj-col-header');
                const totRow = table.querySelector('tr.proj-total');
                const secH = secRow ? secRow.getBoundingClientRect().height : 0;
                const colH = colRow ? colRow.getBoundingClientRect().height : 0;
                if (colRow) colRow.querySelectorAll('th').forEach(th => th.style.top = secH + 'px');
                // proj-total sekarang di dalam thead, top = secH + colH (tanpa gap)
                if (totRow) totRow.querySelectorAll('td').forEach(td => td.style.top = (secH + colH) + 'px');
            });
        }

let trendChart = null;
        let trendDayChart = null;

        async function loadTrendData() {
            const loading = document.getElementById('loadingTrend');
            if (loading) { loading.style.display='block'; loading.textContent='⏳ Memuat data Trend...'; }
            try {
                const depoSuffix  = selectedDepo.replace(/^data_DEPO_/i, '');
                const _isRegional = (selectedDepo === 'data_SUMMARY');

                if (_isRegional) {
                    // ── Summary Regional: agregasi dari semua trend_DEPO_*.json ──
                    if (loading) loading.textContent = '⏳ Memuat trend semua depo...';

                    let depoSuffixes = [];
                    try {
                        const dlRes = await fetch('depo_list.json');
                        if (dlRes.ok) {
                            const dl = await dlRes.json();
                            depoSuffixes = (dl.depos || []).map(d =>
                                d.trim().toUpperCase().replace(/^DEPO\s+/i,'').replace(/\s+/g,'_')
                            );
                        }
                    } catch(e) { console.warn('depo_list.json error (loadTrendData):', e); }

                    const trendFetches = await Promise.all(depoSuffixes.map(async sfx => {
                        try {
                            const r = await fetch('trend_DEPO_' + sfx + '.json');
                            if (!r.ok) return null;
                            const j = await r.json();
                            return { daily: j.daily || [], weekly: j.weekly || j.data || [] };
                        } catch(e) { return null; }
                    }));

                    // Agregasi daily by Date
                    const dailyMap = {};
                    trendFetches.forEach(td => {
                        if (!td) return;
                        (td.daily || []).forEach(r => {
                            const dt = r.Date || '';
                            if (!dt) return;
                            if (!dailyMap[dt]) dailyMap[dt] = { Date: dt, SO: 0, DO: 0, BP: 0 };
                            dailyMap[dt].SO += Number(r.SO || 0);
                            dailyMap[dt].DO += Number(r.DO || 0);
                            dailyMap[dt].BP += Number(r.BP || 0);
                        });
                    });
                    const parseDt = s => { const p=(s||'').split('/'); return p.length===3?new Date(+p[2],+p[1]-1,+p[0]):new Date(0); };
                    window._trendDailyData       = Object.values(dailyMap).sort((a,b)=>parseDt(a.Date)-parseDt(b.Date));
                    window._trendDailyData._depo = '_regional_';

                    // Gabungkan weekly records
                    const aggWeekly = [];
                    trendFetches.forEach(td => { if (td) (td.weekly||[]).forEach(r => aggWeekly.push(r)); });
                    window._trendWeeklyData = aggWeekly;

                } else {
                    // ── Per-depo ──
                    const res = await fetch('trend_DEPO_' + depoSuffix + '.json');
                    if (!res.ok) throw new Error('trend_DEPO_' + depoSuffix + '.json tidak ditemukan');
                    const json = await res.json();
                    if (json.weekly !== undefined || json.daily !== undefined) {
                        window._trendWeeklyData      = json.weekly || [];
                        window._trendDailyData       = json.daily  || [];
                        window._trendDailyData._depo = depoSuffix;
                    } else {
                        window._trendWeeklyData = json.data || [];
                        window._trendDailyData  = [];
                    }
                }

                window.trendLoaded = true;
                if (loading) loading.style.display = 'none';
                renderTrendChart();
            } catch(e) {
                if (loading) loading.textContent = '❌ ' + e.message;
            }
        }

        function renderTrendChart() {
            const wrap = document.getElementById('trendChartWrap');
            if (!wrap) return;

            const weeklyRaw = window._trendWeeklyData || [];
            const dailyData = window._trendDailyData  || [];

            const fmtJt = v => {
                if (!v && v!==0) return '0';
                const n=Number(v), jt=n/1e6;
                return Math.abs(jt)>=1000 ? jt.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')+' jt'
                     : Math.abs(jt)>=1    ? jt.toFixed(1)+' jt'
                     : (n/1e3).toFixed(0)+' rb';
            };
            const fmtDay = s => { const p=(s||'').split('/'); return p.length===3?parseInt(p[1])+'/'+parseInt(p[0]):s; };

            // Aggregate weekly: group by Bulan+Week, sum Week_Report
            const moIdx = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Mei:4,Jun:5,Jul:6,Aug:7,Agu:7,Sep:8,Oct:9,Okt:9,Nov:10,Dec:11,Des:11};
            const aggMap = {};
            weeklyRaw.forEach(r => {
                const bulan = String(r.Bulan||'').trim();
                const week  = String(r.Week ||'').trim();
                if (!bulan||!week) return;
                const key = bulan+' '+week;
                if (!aggMap[key]) aggMap[key] = { bulan, week, val:0 };
                aggMap[key].val += Number(r.Week_Report||r.NetSalesPKD||0);
            });
            // Parse bulan: support format "Mar-25", "Mar-2025", "Mar 25", "Mar 2025"
            const parseBulan = (bulan) => {
                const norm = bulan.replace(/\s+/g, '-');
                const parts = norm.split('-');
                const mo = parts[0] || '';
                let yr = parseInt(parts[1] || '0');
                if (yr > 0 && yr < 100) yr += 2000; // 25 → 2025
                return { mo, yr };
            };
            const sortedKeys = Object.keys(aggMap).sort((a,b) => {
                const ra=aggMap[a], rb=aggMap[b];
                const {mo:ma, yr:ya} = parseBulan(ra.bulan);
                const {mo:mb, yr:yb} = parseBulan(rb.bulan);
                const yi = ya - yb; if(yi!==0) return yi;
                const mi=(moIdx[ma]??99)-(moIdx[mb]??99); if(mi!==0) return mi;
                return parseInt(ra.week.replace('W',''))-parseInt(rb.week.replace('W',''));
            });
            const wValues = sortedKeys.map(k=>aggMap[k].val);

            // Color bulan ini vs lainnya
            const now=new Date();
            const curM = now.toLocaleString('en-US',{month:'short'})+'-'+String(now.getFullYear()).slice(2);
            const barColors    = sortedKeys.map(k=>aggMap[k].bulan===curM?'rgba(14,116,144,0.85)':'rgba(148,197,218,0.55)');
            const borderColors = sortedKeys.map(k=>aggMap[k].bulan===curM?'#0e7490':'#93c5d5');

            // Avg line per bulan
            const mAvg={};
            sortedKeys.forEach(k=>{ const bl=aggMap[k].bulan; if(!mAvg[bl]) mAvg[bl]={sum:0,n:0}; mAvg[bl].sum+=aggMap[k].val; mAvg[bl].n++; });
            const avgLine=sortedKeys.map(k=>{ const bl=aggMap[k].bulan; return mAvg[bl]?mAvg[bl].sum/mAvg[bl].n:null; });

            wrap.innerHTML = `
                <div style="background:white;border-radius:12px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">📈 Trend Penjualan By Week</h3>
                        <span style="font-size:11px;color:#94a3b8;">${sortedKeys.length} minggu · bar=aktual/week · garis=rata-rata/bulan</span>
                    </div>
                    <div style="height:320px;position:relative;"><canvas id="trendCanvas"></canvas></div>
                </div>
`;

            // Weekly chart
            if (trendChart) trendChart.destroy();
            const wCtx = document.getElementById('trendCanvas');
            if (wCtx) trendChart = new Chart(wCtx.getContext('2d'), {
                data:{ labels:sortedKeys, datasets:[
                    { type:'bar',  label:'Actual/Week', data:wValues,  backgroundColor:barColors, borderColor:borderColors, borderWidth:1, borderRadius:4, order:2 },
                    { type:'line', label:'Avg/Bulan',   data:avgLine,  borderColor:'#f97316', backgroundColor:'transparent', borderWidth:2, pointRadius:0, borderDash:[5,3], order:1 }
                ]},
                options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false},
                    plugins:{ legend:{display:true,position:'top',labels:{font:{size:11},boxWidth:14}},
                        tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': '+fmtJt(ctx.parsed.y)}}},
                    scales:{
                        x:{ticks:{font:{size:10},maxRotation:45,callback:(val,idx)=>{ const l=sortedKeys[idx]||''; return l.includes('W1')?l:l.split(' ').pop(); }},grid:{display:false}},
                        y:{ticks:{font:{size:10},callback:v=>fmtJt(v)},grid:{color:'rgba(0,0,0,0.05)'}}
                    }
                }
            });

        }

// =====================================================================
        // EXPORT CATEGORY TO EXCEL
        // =====================================================================
        function exportCategoryExcel() {
            const table = document.querySelector('#catTableWrap table');
            if (!table) { alert('Tidak ada data untuk diekspor.'); return; }

            // Expand all rows dulu agar semua baris visible
            toggleCatAll(true);

            // Kumpulkan data dari semua baris yang visible
            const rows = [];
            const headers = [];

            // Header
            table.querySelectorAll('thead tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('th').forEach(th => row.push(th.innerText.trim().replace(/\n/g,' ')));
                if (row.some(c => c)) headers.push(row);
            });

            // Data rows (termasuk yang di-hidden saat collapse — kita paksa baca semua)
            table.querySelectorAll('tbody tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => {
                    // Ambil text bersih, strip spans
                    row.push(td.innerText.trim().replace(/\n/g,' '));
                });
                if (row.length > 0) rows.push(row);
            });

            // Buat workbook
            const wb = XLSX.utils.book_new();
            const wsData = [...headers, ...rows];
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Auto column width
            const colWidths = wsData[0] ? wsData[0].map((_, ci) => ({
                wch: Math.min(40, Math.max(10, ...wsData.map(r => (r[ci]||'').toString().length)))
            })) : [];
            ws['!cols'] = colWidths;

            // Nama sheet berdasarkan salesman yang dipilih
            const sm = document.getElementById('catSalesmanSelect').value || 'All Salesman';
            const sheetName = ('Category_' + sm).replace(/[\\\/\?\*\[\]:]/g,'_').substring(0,31);

            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            // Filename
            const now = new Date();
            const ts = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2);
            XLSX.writeFile(wb, `Category_${sm.replace(/\s+/g,'_')}_${ts}.xlsx`);
        }

        // =====================================================================
        // SAVE CATEGORY AS IMAGE (full table, not just viewport)
        // =====================================================================
        function savePareto25Excel(type, btn) {
            const isOutlet  = type === 'outlet';
            const data      = isOutlet ? (_pareto25OutletData || []) : (_pareto25SkuData || []);
            const issueEl   = document.getElementById(isOutlet ? 'p25OutletIssue' : 'p25SkuIssue');
            const planEl    = document.getElementById(isOutlet ? 'p25OutletPlan'  : 'p25SkuPlan');

            if (!data.length) { alert('Tidak ada data.'); return; }

            const issue     = issueEl && issueEl.value.trim() ? issueEl.value.trim() : '';
            const plan      = planEl  && planEl.value.trim()  ? planEl.value.trim()  : '';
            const depoLabel = document.getElementById('depoName')?.textContent || '';
            const titleFile = isOutlet ? '25_Pareto_Outlet' : '25_Pareto_SKU';
            const prFile    = isOutlet ? ('_' + (_pareto25ActivePr || 'ALL')) : '';
            const now = new Date();
            const ts  = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2);

            // Filter data sama seperti tampilan
            let rows;
            if (isOutlet) {
                rows = (_pareto25OutletData || [])
                    .filter(r => r.Principle === _pareto25ActivePr)
                    .sort((a,b) => (b.L3M||0)-(a.L3M||0)).slice(0,25);
            } else {
                // Group by SzNickName — sama persis dengan renderPareto25Sku
                const _xlsMap = {};
                (_pareto25SkuData || []).forEach(r => {
                    const key = r.SzNickName || r.SzName || '?';
                    if (!_xlsMap[key]) {
                        _xlsMap[key] = { ...r, L3M: 0, LY: 0, LM: 0, MTD: 0, _ofrSum: 0, _ofrCnt: 0 };
                    }
                    _xlsMap[key].L3M += r.L3M || 0;
                    _xlsMap[key].LY  += r.LY  || 0;
                    _xlsMap[key].LM  += r.LM  || 0;
                    _xlsMap[key].MTD += r.MTD || 0;
                    if (r.OFR2 != null) { _xlsMap[key]._ofrSum += r.OFR2; _xlsMap[key]._ofrCnt++; }
                });
                Object.values(_xlsMap).forEach(r => {
                    r.OFR2 = r._ofrCnt > 0 ? r._ofrSum / r._ofrCnt : null;
                });
                rows = Object.values(_xlsMap).sort((a,b) => (b.L3M||0)-(a.L3M||0)).slice(0,25);
            }

            if (!rows.length) { alert('Tidak ada data.'); return; }

            // ── Build worksheet data ─────────────────────────────────────────
            const wsData = [];

            if (isOutlet) {
                // Header
                wsData.push(['#','Nama Pelanggan','ID Pelanggan','Principle',
                    'L3M','LY','LM','MTD','Gap vs L3M',
                    'vs LY (%)','vs L3M (%)','vs LM (%)']);
                // Total row
                const tot = rows.reduce((acc,r)=>({
                    L3M: acc.L3M+(r.L3M||0), LY: acc.LY+(r.LY||0),
                    LM:  acc.LM +(r.LM ||0), MTD:acc.MTD+(r.MTD||0)
                }), {L3M:0,LY:0,LM:0,MTD:0});
                const totGap = tot.MTD - tot.L3M;
                wsData.push(['TOTAL', rows.length + ' outlet', '', '',
                    tot.L3M, tot.LY, tot.LM, tot.MTD, totGap,
                    tot.LY  > 0 ? +(tot.MTD/tot.LY  *100).toFixed(2) : '',
                    tot.L3M > 0 ? +(tot.MTD/tot.L3M *100).toFixed(2) : '',
                    tot.LM  > 0 ? +(tot.MTD/tot.LM  *100).toFixed(2) : ''
                ]);
                // Data rows
                rows.forEach((r,i) => {
                    const gap = (r.MTD||0) - (r.L3M||0);
                    wsData.push([
                        i+1,
                        r['Nama Pelanggan'] || '',
                        r['SzCustId'] || '',
                        r.Principle || '',
                        r.L3M  || 0,
                        r.LY   || 0,
                        r.LM   || 0,
                        r.MTD  || 0,
                        gap,
                        r.LY  > 0 ? +(((r.MTD||0)/r.LY )*100).toFixed(2) : '',
                        r.L3M > 0 ? +(((r.MTD||0)/r.L3M)*100).toFixed(2) : '',
                        r.LM  > 0 ? +(((r.MTD||0)/r.LM )*100).toFixed(2) : ''
                    ]);
                });
            } else {
                // Header SKU
                wsData.push(['#','Nama SKU','Nick',
                    'L3M','LY','LM','MTD','Gap vs L3M',
                    'vs LY (%)','vs L3M (%)','vs LM (%)','OFR (%)']);
                // Total row
                const tots = rows.reduce((acc,r)=>({
                    L3M: acc.L3M+(r.L3M||0), LY: acc.LY+(r.LY||0),
                    LM:  acc.LM +(r.LM ||0), MTD:acc.MTD+(r.MTD||0)
                }), {L3M:0,LY:0,LM:0,MTD:0});
                const totGapS = tots.MTD - tots.L3M;
                const avgOfr  = rows.length > 0 ? rows.reduce((s,r)=>s+(r.OFR2||0),0)/rows.length : 0;
                wsData.push(['TOTAL', rows.length + ' SKU', '',
                    tots.L3M, tots.LY, tots.LM, tots.MTD, totGapS,
                    tots.LY  > 0 ? +(tots.MTD/tots.LY  *100).toFixed(2) : '',
                    tots.L3M > 0 ? +(tots.MTD/tots.L3M *100).toFixed(2) : '',
                    tots.LM  > 0 ? +(tots.MTD/tots.LM  *100).toFixed(2) : '',
                    +(avgOfr*100).toFixed(2)
                ]);
                // Data rows
                rows.forEach((r,i) => {
                    const gap = (r.MTD||0) - (r.L3M||0);
                    wsData.push([
                        i+1,
                        r.SzName     || '',
                        r.SzNickName || '',
                        r.L3M  || 0,
                        r.LY   || 0,
                        r.LM   || 0,
                        r.MTD  || 0,
                        gap,
                        r.LY  > 0 ? +(((r.MTD||0)/r.LY )*100).toFixed(2) : '',
                        r.L3M > 0 ? +(((r.MTD||0)/r.L3M)*100).toFixed(2) : '',
                        r.LM  > 0 ? +(((r.MTD||0)/r.LM )*100).toFixed(2) : '',
                        r.OFR2 != null ? +(r.OFR2*100).toFixed(2) : ''
                    ]);
                });
            }

            // Append Issue & Activity Plan jika ada
            if (issue || plan) {
                wsData.push([]);
                if (issue) { wsData.push(['Issue:']); issue.split('\n').forEach(l => wsData.push(['', l])); }
                if (plan)  { wsData.push([]); wsData.push(['Activity Plan:']); plan.split('\n').forEach(l => wsData.push(['', l])); }
            }

            // ── Build workbook ───────────────────────────────────────────────
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);

            // Format number columns
            const numCols = isOutlet ? [4,5,6,7,8] : [3,4,5,6,7]; // 0-indexed
            const pctCols = isOutlet ? [9,10,11] : [8,9,10,11];
            const range   = XLSX.utils.decode_range(ws['!ref']);
            for (let R = 1; R <= range.e.r; R++) {
                numCols.forEach(C => {
                    const cell = ws[XLSX.utils.encode_cell({r:R, c:C})];
                    if (cell && typeof cell.v === 'number') cell.z = '#,##0';
                });
                pctCols.forEach(C => {
                    const cell = ws[XLSX.utils.encode_cell({r:R, c:C})];
                    if (cell && typeof cell.v === 'number') cell.z = '0.00"%"';
                });
            }

            // Column widths
            const colW = wsData[0].map((_,ci) => ({
                wch: Math.min(40, Math.max(8, ...wsData.map(r => (r[ci]||'').toString().length)))
            }));
            ws['!cols'] = colW;

            const sheetName = (isOutlet ? ('Outlet_'+(_pareto25ActivePr||'ALL')) : 'SKU')
                .replace(/[\\/\?\*\[\]:]/g,'_').substring(0,31);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);

            const origText = btn ? btn.textContent : '';
            if (btn) { btn.textContent = 'Menyimpan...'; btn.disabled = true; }
            try {
                XLSX.writeFile(wb, titleFile + prFile + '_' + depoLabel.replace(/\s+/g,'') + '_' + ts + '.xlsx');
            } finally {
                if (btn) { btn.textContent = origText; btn.disabled = false; }
            }
        }


        // ─── Generic Save as PNG ────────────────────────────────────────
        async function saveAsImage(el, filename, btn) {
            if (!el) { alert('Tidak ada data untuk disimpan.'); return; }
            const origMaxH  = el.style.maxHeight;
            const origOvY   = el.style.overflowY;
            const origOvX   = el.style.overflowX;
            el.style.maxHeight  = 'none';
            el.style.overflowY  = 'visible';
            el.style.overflowX  = 'visible';
            el.scrollTop  = 0;
            el.scrollLeft = 0;

            const origTxt = btn ? btn.innerHTML : '';
            if (btn) { btn.innerHTML = '⏳ Memproses...'; btn.disabled = true; }

            try {
                // Buat wrapper dengan header watermark agar gambar punya konteks
                const depoLabel = document.getElementById('depoName')?.textContent || '';
                const now       = new Date();
                const tsLabel   = now.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})
                                + ' ' + now.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
                const tsFile    = now.getFullYear()
                                + ('0'+(now.getMonth()+1)).slice(-2)
                                + ('0'+now.getDate()).slice(-2);

                // Clone wrapper + watermark header
                const outer = document.createElement('div');
                outer.style.cssText = 'position:fixed;left:-9999px;top:0;background:#f0f4f8;padding:0;font-family:inherit;';
                const hdr = document.createElement('div');
                hdr.style.cssText = 'background:linear-gradient(135deg,#1e40af,#2563eb);color:white;padding:10px 18px;display:flex;align-items:center;justify-content:space-between;font-size:12px;';
                hdr.innerHTML = `<span style="font-weight:700;font-size:13px;">📊 OneSheet Kalimantan${depoLabel?' · '+depoLabel:''}</span><span style="opacity:0.8;">${tsLabel}</span>`;
                const clone = el.cloneNode(true);
                clone.style.cssText += ';max-height:none;overflow:visible;';
                outer.appendChild(hdr);
                outer.appendChild(clone);
                document.body.appendChild(outer);

                const canvas = await html2canvas(outer, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#f0f4f8',
                    scrollX: 0,
                    scrollY: -window.scrollY,
                    windowWidth: outer.scrollWidth + 40,
                    windowHeight: outer.scrollHeight + 40,
                    logging: false,
                });
                document.body.removeChild(outer);

                const link = document.createElement('a');
                link.download = filename.replace('{ts}', tsFile) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch(e) {
                console.error('Save image error:', e);
                alert('Gagal menyimpan gambar: ' + e.message);
            } finally {
                el.style.maxHeight  = origMaxH;
                el.style.overflowY  = origOvY;
                el.style.overflowX  = origOvX;
                if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
            }
        }

        function saveKlasemenImage(btn) {
            const el = document.getElementById('klasemenWrap');
            if (!el || !el.querySelector('.kls-card')) { alert('Klasemen belum dimuat.'); return; }
            const depo = (document.getElementById('depoName')?.textContent || 'Regional').replace(/\s+/g,'_');
            saveAsImage(el, `Klasemen_${depo}_{ts}`, btn);
        }

		// ─────────────────────────────────────────────────────────────────────────
		// SAVE PROJECT EXCEL  –  versi fix: selector fleksibel + smart wait
		// ─────────────────────────────────────────────────────────────────────────
		async function saveProjectExcel(btn) {
			const wrap = document.getElementById('projTableWrap');
			if (!wrap || !wrap.querySelector('table')) {
				alert('Data project belum dimuat.'); return;
			}

			const origTxt = btn ? btn.innerHTML : '';
			if (btn) { btn.innerHTML = '⏳ Menyiapkan...'; btn.disabled = true; }

			try {
				const wb   = XLSX.utils.book_new();
				const depo = (document.getElementById('depoName')?.textContent || '').replace(/\s+/g,'_');
				const now  = new Date();
				const ts   = now.getFullYear()
						   + ('0'+(now.getMonth()+1)).slice(-2)
						   + ('0'+now.getDate()).slice(-2);

				// ── 1. Temukan semua elemen tab project ───────────────────────────
				// Cari semua child langsung #projSubTabs: button, div, span, a
				const projSubTabs = document.getElementById('projSubTabs');
				const tabEls = projSubTabs
					? Array.from(projSubTabs.querySelectorAll('button, div, span, a'))
						  .filter(el => {
							  const txt = el.textContent.trim();
							  // Filter: punya teks, bukan container kosong, bukan nested dalam tab lain
							  return txt.length > 0
								  && txt.length < 60
								  && el.parentElement === projSubTabs; // hanya direct child
						  })
					: [];

				if (!tabEls.length) {
					// Fallback total: tidak bisa iterasi tab, simpan yang aktif saja
					const tbl  = wrap.querySelector('table');
					const name = window._activeProject || 'Project';
					XLSX.utils.book_append_sheet(wb, _projTableToWs(tbl), _projSheetName(name, new Set()));
					XLSX.writeFile(wb, `Project_${depo}_${ts}.xlsx`);
					return;
				}

				const usedNames   = new Set();
				const savedActive = window._activeProject || '';

				// ── 2. Loop setiap tab, klik, tunggu data, ambil tabel ────────────
				for (const tabEl of tabEls) {
					// Ambil nama project dari teks tab (bersihkan emoji & spasi)
					const projName = (
						tabEl.dataset.proj     ||
						tabEl.dataset.project  ||
						tabEl.textContent
					).trim().replace(/[\u{1F300}-\u{1FFFF}]/gu, '').trim();

					if (!projName) continue;
					if (btn) btn.innerHTML = `⏳ ${projName}…`;

					// Klik tab
					tabEl.click();

					// ── Smart wait: tunggu header tabel berubah ke project ini ────
					// Header tabel berisi teks "Project: [nama] — X Outlet"
					await _waitProjLoaded(wrap, projName, 3000);

					const tbl = wrap.querySelector('table');
					if (!tbl) continue;

					const sheetName = _projSheetName(projName, usedNames);
					XLSX.utils.book_append_sheet(wb, _projTableToWs(tbl), sheetName);
					usedNames.add(sheetName);
				}

				// ── 3. Kembalikan ke tab semula ───────────────────────────────────
				if (savedActive) {
					const origTab = tabEls.find(t =>
						t.textContent.trim().includes(savedActive) ||
						t.dataset.proj === savedActive
					);
					if (origTab) { origTab.click(); }
				}

				if (!wb.SheetNames.length) { alert('Tidak ada data project untuk diekspor.'); return; }

				XLSX.writeFile(wb, `Project_${depo}_${ts}.xlsx`);

			} catch(e) {
				console.error('saveProjectExcel:', e);
				alert('Gagal export Excel: ' + e.message);
			} finally {
				if (btn) { btn.innerHTML = origTxt; btn.disabled = false; }
			}
		}

		// ── Smart wait: polling sampai header tabel memuat project yang diharapkan ─
		// Memanfaatkan teks "Project: Chiller GBS — 49 Outlet" di baris thead/caption
		function _waitProjLoaded(wrap, expectedName, maxMs = 3000) {
			return new Promise(resolve => {
				const deadline = Date.now() + maxMs;
				const check = setInterval(() => {
					// Cek di seluruh teks dalam wrap: caption, th, atau div judul tabel
					const bodyText = wrap.innerText || '';
					const nameClean = expectedName.replace(/\s+/g,' ').trim().toLowerCase();
					const found = bodyText.toLowerCase().includes(nameClean);

					if (found || Date.now() >= deadline) {
						clearInterval(check);
						// Buffer kecil setelah konten terdeteksi
						setTimeout(resolve, 80);
					}
				}, 60);
			});
		}

		// ── Helper: DOM table → worksheet  (dengan kolom Nama Depo) ──────────────
		function _projTableToWs(table) {
			const aoa = [];
			let namaColIdx = -1; // index kolom NAMA PELANGGAN

			// ── THEAD: cari index kolom Pelanggan, sisipkan header "Nama Depo" ────
			table.querySelectorAll('thead tr').forEach(tr => {
				const row = [];
				tr.querySelectorAll('th').forEach((th, ci) => {
					const txt = th.innerText.trim().replace(/\n/g,' ');
					row.push(txt);
					if (namaColIdx < 0 &&
						(txt.toUpperCase().includes('PELANGGAN') ||
						 txt.toUpperCase().includes('NAMA'))) {
						namaColIdx = ci;
					}
				});
				if (row.some(Boolean)) {
					if (namaColIdx >= 0) {
						// Sisipkan header "Nama Depo" tepat setelah kolom NAMA PELANGGAN
						const r = [...row];
						r.splice(namaColIdx + 1, 0, 'Nama Depo');
						aoa.push(r);
					} else {
						aoa.push(row);
					}
				}
			});

			// ── TBODY ─────────────────────────────────────────────────────────────
			table.querySelectorAll('tbody tr').forEach(tr => {
				if (tr.style.display === 'none') return;
				const row = [];

				tr.querySelectorAll('td').forEach((td, ci) => {
					if (ci === namaColIdx && namaColIdx >= 0) {
						// ── Pisahkan Nama Pelanggan vs Nama Depo ─────────────────
						// Strategi 1: innerText dibagi per baris (paling robust)
						const lines = td.innerText.trim()
							.split('\n')
							.map(l => l.trim())
							.filter(Boolean);

						const namaCustomer = lines[0] || '';

						// Cari baris yang mengandung "Depo" sebagai nama depo
						const depoLine = lines.find((l, i) =>
							i > 0 && (
								l.toLowerCase().startsWith('depo') ||
								l.toLowerCase().includes('depo ')
							)
						) || (lines.length > 1 ? lines[lines.length - 1] : '');

						row.push(namaCustomer); // kolom NAMA PELANGGAN
						row.push(depoLine);     // kolom NAMA DEPO (baru)

					} else {
						// Kolom lain: coba konversi angka (format ribuan titik, desimal koma)
						const raw   = td.innerText.trim().replace(/\n/g,' ');
						const clean = raw.replace(/\./g,'').replace(',','.');
						const num   = parseFloat(clean);
						row.push(!isNaN(num) && /^[\d.,+\-\s]+$/.test(raw) ? num : raw);
					}
				});

				if (row.length) aoa.push(row);
			});

			// ── Buat worksheet & auto column width ────────────────────────────────
			const ws = XLSX.utils.aoa_to_sheet(aoa);
			if (aoa.length) {
				ws['!cols'] = aoa[0].map((_, ci) => ({
					wch: Math.min(45, Math.max(8,
						...aoa.map(r => String(r[ci] ?? '').length)
					))
				}));
			}
			return ws;
		}

		// ── Helper: nama sheet unik ≤31 karakter ─────────────────────────────────
		function _projSheetName(name, usedSet) {
			let base = name.replace(/[\\\/\?\*\[\]:]/g,'').trim().substring(0,31);
			if (!usedSet.has(base)) return base;
			let i = 2;
			while (usedSet.has(base.substring(0,28)+'_'+i)) i++;
			return base.substring(0,28)+'_'+i;
		}

        async function saveCategoryImage() {
            const wrap = document.getElementById('catTableWrap');
            if (!wrap || !wrap.querySelector('table')) { alert('Tidak ada data untuk disimpan.'); return; }

            // Tidak expand — capture sesuai tampilan saat ini
            wrap.scrollTop = 0;
            wrap.scrollLeft = 0;

            // Simpan max-height sementara, set ke none agar full
            const origMaxH = wrap.style.maxHeight;
            const origOverflow = wrap.style.overflowY;
            wrap.style.maxHeight = 'none';
            wrap.style.overflowY = 'visible';

            const btn = event.target;
            btn.textContent = '⏳ Memproses...';
            btn.disabled = true;

            try {
                const canvas = await html2canvas(wrap, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    scrollX: 0,
                    scrollY: 0,
                    windowWidth: wrap.scrollWidth + 40,
                    windowHeight: wrap.scrollHeight + 40
                });

                const sm = document.getElementById('catSalesmanSelect').value || 'All_Salesman';
                const now = new Date();
                const ts = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2);
                const link = document.createElement('a');
                link.download = `Category_${sm.replace(/\s+/g,'_')}_${ts}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            } finally {
                wrap.style.maxHeight = origMaxH;
                wrap.style.overflowY = origOverflow;
                btn.textContent = '🖼️ Save Image';
                btn.disabled = false;
            }
        }

// ===== ADMIN PASSWORD MANAGEMENT =====

        let _newUsersData = null; // Updated users array to be downloaded

        function openAdminPasswordModal() {
            const modal = document.getElementById('adminPwdModal');
            modal.style.display = 'flex';
            // Populate user select
            const sel = document.getElementById('adminPwdUserSelect');
            sel.innerHTML = '<option value="">-- Pilih username --</option>';
            USERS.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.username;
                const roleLabel = u.role === 'admin' ? '👑 Admin' : u.role === 'region' ? '🌏 Region' : '🏪 Depo';
                opt.textContent = `${u.username} — ${roleLabel}`;
                sel.appendChild(opt);
            });
            // Reset fields
            document.getElementById('adminPwdNew').value = '';
            document.getElementById('adminPwdConfirm').value = '';
            adminPwdMsg('', '');
            document.getElementById('adminPwdRoleInfo').style.display = 'none';
            document.getElementById('adminPwdDownloadArea').style.display = 'none';
            _newUsersData = null;
        }

        function closeAdminPasswordModal() {
            document.getElementById('adminPwdModal').style.display = 'none';
        }

        function onAdminUserChange() {
            const uname = document.getElementById('adminPwdUserSelect').value;
            const infoEl = document.getElementById('adminPwdRoleInfo');
            if (!uname) { infoEl.style.display = 'none'; return; }
            const usr = USERS.find(u => u.username === uname);
            if (!usr) return;
            const depoInfo = usr.depo ? ` — Depo: <strong>${usr.depo.replace(/_/g,' ')}</strong>` : '';
            infoEl.innerHTML = `Role: <strong>${usr.role.toUpperCase()}</strong>${depoInfo}`;
            infoEl.style.display = 'block';
            document.getElementById('adminPwdDownloadArea').style.display = 'none';
            adminPwdMsg('', '');
        }

        function togglePwdVisibility(inputId, btnId) {
            const inp = document.getElementById(inputId);
            inp.type = inp.type === 'password' ? 'text' : 'password';
        }

        function adminPwdMsg(text, type) {
            const el = document.getElementById('adminPwdMsg');
            if (!text) { el.style.display = 'none'; return; }
            const colors = { error:'#fef2f2', ok:'#f0fdf4' };
            const borders = { error:'#fca5a5', ok:'#86efac' };
            const textC = { error:'#991b1b', ok:'#166534' };
            el.style.cssText = `display:block;margin-bottom:14px;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:600;background:${colors[type]||'#f8fafc'};border:1px solid ${borders[type]||'#e2e8f0'};color:${textC[type]||'#334155'};`;
            el.textContent = text;
        }

        async function saveNewPassword() {
            const uname = document.getElementById('adminPwdUserSelect').value;
            const newPwd = document.getElementById('adminPwdNew').value;
            const confPwd = document.getElementById('adminPwdConfirm').value;

            if (!uname) { adminPwdMsg('⚠️ Pilih user terlebih dahulu.', 'error'); return; }
            if (!newPwd) { adminPwdMsg('⚠️ Password baru tidak boleh kosong.', 'error'); return; }
            if (newPwd.length < 6) { adminPwdMsg('⚠️ Password minimal 6 karakter.', 'error'); return; }
            if (newPwd !== confPwd) { adminPwdMsg('⚠️ Konfirmasi password tidak cocok.', 'error'); return; }

            const hashed = await sha256(newPwd);
            // Update local USERS array
            const updatedUsers = USERS.map(u => {
                if (u.username === uname) return { ...u, hash: hashed };
                return u;
            });
            _newUsersData = { _info: 'Passwords di-hash dengan SHA-256. Gunakan menu Admin > Kelola Password untuk mengganti.', users: updatedUsers };

            // Update in-memory too so admin can change multiple
            USERS = updatedUsers;

            adminPwdMsg(`✅ Password untuk "${uname}" berhasil di-hash. Download file users.json di bawah.`, 'ok');
            document.getElementById('adminPwdDownloadArea').style.display = 'block';
            document.getElementById('adminPwdNew').value = '';
            document.getElementById('adminPwdConfirm').value = '';
        }

        function downloadUsersJson() {
            if (!_newUsersData) return;
            const blob = new Blob([JSON.stringify(_newUsersData, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'users.json';
            a.click();
            URL.revokeObjectURL(a.href);
        }

        // Close modal on backdrop click
        document.getElementById('adminPwdModal').addEventListener('click', function(e) {
            if (e.target === this) closeAdminPasswordModal();
        });

        // ═══════════════════════════════════════════════════════════════
        //  AI INSIGHT MODULE — khusus depo.tanjung
        // ═══════════════════════════════════════════════════════════════

        const _AI = {
            groq: {
                url:   'https://api.groq.com/openai/v1/chat/completions',
                model: 'llama-3.1-8b-instant',
                label: '⚡ Groq',
                get key() { return localStorage.getItem('ai_key_groq') || ''; }
            },
            gemini: {
                url:   'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                label: '✨ Gemini',
                get key() { return localStorage.getItem('ai_key_gemini') || ''; }
            },
            gemini15pro: {
                url:   'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent',
                label: '🔵 Gemini 1.5 Pro',
                get key() { return localStorage.getItem('ai_key_gemini') || ''; }
            },
            openrouter: {
                url:   'https://openrouter.ai/api/v1/chat/completions',
                label: '🔀 OpenRouter',
                get key()   { return localStorage.getItem('ai_key_openrouter') || ''; },
                get model() { return localStorage.getItem('ai_model_openrouter') || 'meta-llama/llama-3.3-70b-instruct:free'; }
            },
            cohere: {
                url:   'https://api.cohere.com/v2/chat',
                model: 'command-r-plus-08-2024',
                label: '🟡 Cohere',
                get key() { return localStorage.getItem('ai_key_cohere') || ''; }
            }
        };

        let _aiProv     = localStorage.getItem('ai_provider') || 'groq';
        let _aiConv     = [];
        let _aiBusy     = false;
        let _aiProses   = null;
        let _aiLastData = null;

        // ── Init ──────────────────────────────────────────────────────
        function initAIInsight() {
            window._aiInitialized = true;
            _aiUpdateProvUI();
            const hasKey = _AI.groq.key || _AI.gemini.key || _AI.openrouter.key || _AI.cohere.key;
            if (!hasKey) { setTimeout(aiOpenSettings, 400); return; }
            _aiAnalyze();
        }

        // ── Switch provider ───────────────────────────────────────────
        function aiSwitchProvider(name) {
            if (name !== 'auto' && !_AI[name]) return;
            _aiProv = name;
            localStorage.setItem('ai_provider', name);
            _aiUpdateProvUI();
            const hasKey = name === 'auto'
                ? Object.values(_AI).some(p => p.key)
                : !!_AI[name]?.key;
            if (window._aiInitialized && hasKey) {
                _aiConv = [];
                document.getElementById('aiChatMessages').innerHTML = '';
                document.getElementById('aiInsightCards').innerHTML = '';
                document.getElementById('aiChatDivider').style.display = 'none';
                document.getElementById('aiChipRow').style.display = 'none';
                _aiAnalyze();
            }
        }

        function _aiUpdateProvUI() {
            ['groq','gemini','gem15','or','coh','auto'].forEach(id => {
                const btn = document.getElementById('aiBtn_' + id);
                if (btn) btn.classList.remove('active');
            });
            const map = { groq:'groq', gemini:'gemini', gemini15pro:'gem15', openrouter:'or', cohere:'coh', auto:'auto' };
            const btn = document.getElementById('aiBtn_' + (map[_aiProv] || _aiProv));
            if (btn) btn.classList.add('active');
            const label = _aiProv === 'auto' ? '🟢 Auto' : (_AI[_aiProv]?.label || _aiProv);
            _aiSetStatus('ok', '✓ ' + label);
        }

        function _aiSetStatus(type, text) {
            const el = document.getElementById('aiProvStatus');
            if (!el) return;
            const styles = {
                ok:   { bg:'#e8f5e9', color:'#2e7d32' },
                warn: { bg:'#fffde7', color:'#f57f17' },
                err:  { bg:'#ffebee', color:'#c62828' }
            };
            const s = styles[type] || styles.ok;
            el.style.background = s.bg;
            el.style.color = s.color;
            el.textContent = text;
        }

        // ── Load data & generate insight ──────────────────────────────
        async function _aiAnalyze() {
            const ldEl = document.getElementById('aiInsightLoading');
            const cardsEl = document.getElementById('aiInsightCards');
            if (ldEl) ldEl.style.display = 'flex';
            if (cardsEl) cardsEl.innerHTML = '';
            _aiSetStatus('warn', '⏳ Menganalisis...');
            const ldTxt = document.getElementById('aiLoadTxt');
            const ldSub = document.getElementById('aiLoadSub');
            if (ldTxt) ldTxt.textContent = '🔍 Menganalisis data...';
            if (ldSub) ldSub.textContent = 'Menyiapkan konteks dari data depo...';

            // Load proses jika belum
            if (!_aiProses) {
                try {
                    const suffix = selectedDepo.replace('data_DEPO_', '');
                    if (ldSub) ldSub.textContent = 'Memuat data proses salesman...';
                    const res = await fetch(`proses_DEPO_${suffix}.json`);
                    _aiProses = res.ok ? ((await res.json()).data || []) : [];
                } catch { _aiProses = []; }
            }

            if (ldSub) ldSub.textContent = 'AI sedang menganalisis...';
            const prompt = _aiBuildPrompt();
            try {
                const reply = await _aiCallAPI([{ role: 'user', content: prompt }], 2400);
                _aiConv = [{ role: 'user', content: prompt }, { role: 'assistant', content: reply }];
                _aiRenderCards(reply);
                if (ldEl) ldEl.style.display = 'none';
                const div = document.getElementById('aiChatDivider');
                const chips = document.getElementById('aiChipRow');
                const send = document.getElementById('aiSendBtn');
                if (div)  { div.style.display = 'flex'; }
                if (chips){ chips.style.display = 'flex'; }
                if (send) { send.disabled = false; send.style.opacity = '1'; }
                _aiSetStatus('ok', '✓ ' + (_AI[_aiProv]?.label || _aiProv));
            } catch(err) {
                if (ldEl) ldEl.style.display = 'none';
                if (cardsEl) cardsEl.innerHTML =
                    `<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:12px;padding:16px;font-size:13px;color:#991b1b;">
                    ⚠️ ${_aiEsc(err.message)}<br>
                    <small style="color:#ef4444;display:block;margin-top:6px;">Coba ganti provider atau klik 🔄 Refresh</small></div>`;
                _aiSetStatus('err', '✗ Error');
            }
        }

        // ── Konteks bisnis statis (dipakai di semua prompt) ───────────
        function _aiCtx() {
            return `
=== KONTEKS BISNIS (ACUAN WAJIB) ===

TIM SALESMAN & PRODUK:
• Arjuna   → hanya jual produk GPPJ-A dan GEN
• Bima     → hanya jual produk GPPJ-B, GBS, MBR, HGJ, RANS, GSJ
• Yudistira → jual semua produk Arjuna + Bima (full range)

TIPE SALESMAN & CHANNEL YANG DICOVER:
• SR Wholesaler Arjuna → Wholesaler/Grosir + MTI
• SR Wholesaler Bima   → Wholesaler/Grosir + MTI
• SR Retailer Arjuna   → Retail + MTI
• SR Retailer Bima     → Retail + MTI
• SR Mix Yudistira     → semua Channel (Grosir, Retail, MTI, NKA, FS)

KETENTUAN KHUSUS:
• Wholesaler Arjuna & Bima: bisa cover outlet yang sama
• Retailer Arjuna & Bima: bisa cover outlet yang sama
• Mix Yudistira: masing-masing cover outlet BERBEDA

ISTILAH PRODUKTIVITAS:
• CR (Customer Register) = daftar outlet wajib; standar 100%
• JKS = Jadwal Kunjungan Salesman (Weekly = 1x/minggu, BiWeekly = 2x/2minggu)
• CA (Customer Active) = CR yang sudah transaksi di bulan berjalan
• PC (Plan Call) = jumlah outlet dalam daftar kunjungan per hari
• AC (Actual Call) = outlet yang berhasil dikunjungi; target 100% dari PC
• EC (Effective Call) = CR yang menghasilkan SO
• SO (Sales Order) = order dari aktivitas kunjungan salesman
• ET (Effective Transaction) = SO yang berhasil dikirim (DO)
• AvgSKU = rata-rata SKU per transaksi
• Channel: Grosir, Retail, MTI, NKA, FS (Food Service)

STRUKTUR PIC:
• RH  = Regional Head → membawahi beberapa BH
• BH  = Branch Head → membawahi SAC, Salesman, BLC, BAC
• SAC = Sales Area Coordinator → membawahi salesman langsung
• Salesman → pelaku kunjungan CR; menjalankan 9 Super & aktivitas order
• BLC = Branch Coordinator Logistic → mengatur kiriman & supply stok
• BAC = Branch Administration Coordinator → administrasi, AR, system order
• Dropping = Driver kiriman ke outlet

ISTILAH AKTIVITAS LAPANGAN:
• 9 Super = 9 tahapan wajib tiap kunjungan outlet:
  1.Kerapian Diri 2.Salam & Tagging Outlet 3.Cek Plan/DAP 4.Cek Stok & Pemajangan
  5.Rekomendasi Order 6.Penagihan kredit 7.Penawaran promo/NPL/Negosiasi
  8.Konfirmasi SO & jadwal kiriman 9.Salam & terima kasih
• DAP (Daily Account Plan) = rencana target SO per outlet besok; dibuat sore H-1 saat Daily Connect
• Daily Connect = SAC bertemu 2 salesman terendah tiap sore; bahas hasil hari ini & plan besok
• JC (Join Call) = pendampingan SAC→Salesman & BH→SAC; minimal 3x/minggu SAC, tiap salesman min 1x; menerapkan EDAC
• EDAC = Explain (maks 2 fokus) → Demonstration (outlet 1-3) → Action (outlet 4-6) → Coaching (2 menit)
• MV (Market Visit) = BH/SAC kunjungi outlet pareto Grosir/Retail/MTI; BH 2x/minggu, SAC 2x/minggu
• Sobat = istilah internal untuk competitor
• NPL = New Product Launching
`;
        }

        // ── Build prompt dari data yang sudah ada di memory ───────────
        function _aiBuildPrompt() {
            // Aggregate salesman performance dari rawData
            const smMap = {};
            (rawData || []).forEach(r => {
                const sm = r['Nama Salesman'] || ''; if (!sm) return;
                if (!smMap[sm]) smMap[sm] = { MTD:0, BP:0, BE:0, CR:new Set(), CA:new Set() };
                smMap[sm].MTD += Number(r.MTD || 0);
                smMap[sm].BP  += Number(r.BP  || 0);
                smMap[sm].BE  += Number(r.BE  || 0);
                const id = r['Id Pelanggan'] || r['ID Pelanggan'] || '';
                if (id) { smMap[sm].CR.add(id); if (Number(r.CA||0)>0) smMap[sm].CA.add(id); }
            });
            const smList = Object.entries(smMap).sort((a,b) => {
                const achA = a[1].BP>0 ? a[1].MTD/a[1].BP : 0;
                const achB = b[1].BP>0 ? b[1].MTD/b[1].BP : 0;
                return achB - achA;
            });
            const totMTD = smList.reduce((s,[,v])=>s+v.MTD, 0);
            const totBP  = smList.reduce((s,[,v])=>s+v.BP,  0);
            const totBE  = smList.reduce((s,[,v])=>s+v.BE,  0);
            const totAch = totBP>0 ? (totMTD/totBP*100).toFixed(1) : '-';
            const smRows = smList.map(([nm,v],i) => {
                const ach = v.BP>0 ? (v.MTD/v.BP*100).toFixed(1) : '-';
                const caRate = v.CR.size>0 ? (v.CA.size/v.CR.size*100).toFixed(0) : '-';
                return `  • ${nm}: Ach ${ach}%, Gap ${_aiFmtRp(v.MTD-v.BP)}, CA/CR ${caRate}%, Rank #${i+1}`;
            }).join('\n');

            // LOB dari catBpData
            const prMap = {};
            (window.catBpData || []).forEach(r => {
                const pr = r.Principle || 'Other';
                if (!prMap[pr]) prMap[pr] = { MTD:0, BP:0 };
                prMap[pr].MTD += Number(r.MTD || 0);
                prMap[pr].BP  += Number(r['T.BP'] || 0);
            });
            const lobRows = Object.entries(prMap)
                .sort((a,b) => a[1].MTD-a[1].BP - (b[1].MTD-b[1].BP))
                .map(([nm,v]) => {
                    const ach = v.BP>0 ? (v.MTD/v.BP*100).toFixed(1) : '-';
                    return `  • ${nm}: Ach ${ach}%, Actual ${_aiFmtRp(v.MTD)}, Gap ${_aiFmtRp(v.MTD-v.BP)}`;
                }).join('\n');

            // Proses salesman — cari yang bermasalah
            const prosesIssues = (_aiProses || []).map(d => {
                const issues = [];
                if ((d['%CA']  || 0) < 0.75) issues.push(`CA ${((d['%CA']||0)*100).toFixed(0)}%`);
                if ((d['%SKU'] || 0) < 0.75) issues.push(`AvgSKU ${(d['A_AvgSKU']||0).toFixed(1)} (${((d['%SKU']||0)*100).toFixed(0)}%)`);
                if ((d['%CR']  || 0) < 1.0)  issues.push(`CR below target ${((d['%CR']||0)*100).toFixed(0)}%`);
                if ((d['%EC']  || 0) < 0.8)  issues.push(`EC ${((d['%EC']||0)*100).toFixed(0)}%`);
                return issues.length ? `  • ${d.szname} (${d['Tipe Salesman']||''}): ${issues.join(', ')}` : null;
            }).filter(Boolean).join('\n');

            const depoName = selectedDepo.replace('data_DEPO_','').replace(/_/g,' ');
            return `Kamu adalah AI analis sales profesional untuk Depo ${depoName}.
${_aiCtx()}
=== PERFORMANCE SALESMAN ===
${smRows || '  (tidak ada data)'}
Total Depo: Ach ${totAch}%, Actual ${_aiFmtRp(totMTD)}, Gap ${_aiFmtRp(totMTD-totBP)}

=== LOB/PRINCIPLE BREAKDOWN ===
${lobRows || '  (tidak ada data)'}

=== KPI PROSES SALESMAN (masalah) ===
${prosesIssues || '  Semua dalam batas normal'}

Berikan analisis dalam format JSON persis (tanpa markdown, tanpa kode blok):
{
  "ringkasan": "2-3 kalimat kondisi overall dengan angka spesifik: achievement total, top/bottom performer, tren utama",
  "root_cause": [
    "akar masalah 1 — jelaskan MENGAPA terjadi (bukan hanya WHAT), kaitkan dengan KPI proses/LOB/salesman spesifik",
    "akar masalah 2",
    "akar masalah 3"
  ],
  "activity_plan": [
    {"aksi": "deskripsi tindakan spesifik", "PIC": "nama salesman atau tim", "timeline": "Minggu 1 / Minggu 2 / dst", "target": "angka KPI yang diharapkan"},
    {"aksi": "...", "PIC": "...", "timeline": "...", "target": "..."},
    {"aksi": "...", "PIC": "...", "timeline": "...", "target": "..."},
    {"aksi": "...", "PIC": "...", "timeline": "...", "target": "..."}
  ],
  "quick_wins": [
    "aksi cepat 1 yang bisa dilakukan hari ini/minggu ini, dengan effort rendah dan impact tinggi",
    "aksi cepat 2",
    "aksi cepat 3"
  ]
}`;
        }

        // ── Render Insight Cards ───────────────────────────────────────
        function _aiRenderCards(raw) {
            let data;
            try {
                const clean = raw.replace(/```json|```/g,'').trim();
                data = JSON.parse(clean);
            } catch {
                data = { ringkasan: raw, root_cause: [], activity_plan: [], quick_wins: [] };
            }
            _aiLastData = data;
            const wrap = document.getElementById('aiInsightCards');
            if (!wrap) return;
            wrap.innerHTML = '';

            const mkCard = (cls, icon, title, content) => {
                const d = document.createElement('div');
                d.className = 'ai-ins-card ' + cls;
                d.innerHTML = `<div class="ai-ins-hdr"><span>${icon}</span><span>${_aiEsc(title)}</span></div>
                    <div class="ai-ins-body">${content}</div>`;
                wrap.appendChild(d);
            };

            // 1. Ringkasan
            mkCard('summary', '📊', 'Ringkasan Kondisi',
                `<p style="margin:0;line-height:1.7;">${_aiEsc(data.ringkasan || '-')}</p>`);

            // 2. Root Cause
            const causes = data.root_cause || data.masalah || [];
            if (causes.length) {
                mkCard('rootcause', '🔍', 'Root Cause Analysis',
                    `<ul>${causes.map((c,i)=>`<li><strong>RC${i+1}:</strong> ${_aiEsc(c)}</li>`).join('')}</ul>`);
            }

            // 3. Activity Plan — tabel
            const plans = data.activity_plan || [];
            if (plans.length) {
                const badgeClass = (tl='') => {
                    const t = tl.toLowerCase();
                    if (t.includes('1') || t.includes('satu') || t.includes('ini')) return 'w1';
                    if (t.includes('2') || t.includes('dua')) return 'w2';
                    if (t.includes('3') || t.includes('tiga')) return 'w3';
                    return 'w4';
                };
                const rows = plans.map(p =>
                    `<tr>
                        <td>${_aiEsc(p.aksi || '-')}</td>
                        <td style="font-weight:600;color:#0d47a1;text-align:center;">${_aiEsc(p.PIC || '-')}</td>
                        <td style="color:#2e7d32;font-weight:600;">${_aiEsc(p.target || '-')}</td>
                    </tr>`
                ).join('');
                mkCard('plan', '📋', 'Activity Plan',
                    `<div style="overflow-x:auto;">
                    <table class="ai-plan-table" style="min-width:420px;">
                        <colgroup>
                            <col style="width:240px;">
                            <col style="width:120px;">
                            <col style="width:120px;">
                        </colgroup>
                        <thead><tr>
                            <th>Tindakan</th><th>PIC</th><th>Target</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table></div>`);
            }

            // 4. Quick Wins
            const wins = data.quick_wins || data.rekomendasi || [];
            if (wins.length) {
                mkCard('quickwin', '⚡', 'Quick Wins (Segera Lakukan)',
                    `<ul>${wins.map(w=>`<li style="margin-bottom:4px;">✅ ${_aiEsc(w)}</li>`).join('')}</ul>`);
            }
        }

        // ── Chat ──────────────────────────────────────────────────────
        async function aiSendMessage() {
            const input = document.getElementById('aiChatInput');
            const text = (input?.value || '').trim();
            if (!text || _aiBusy) return;
            input.value = '';
            aiAutoResize(input);
            aiToggleSend();
            _aiAddMsg('user', text);
            _aiScrollBottom();
            await _aiAsk(text);
        }

        async function aiAskChip(q) {
            _aiAddMsg('user', q);
            _aiScrollBottom();
            await _aiAsk(q);
        }

        async function _aiAsk(text) {
            _aiBusy = true;
            const sendBtn = document.getElementById('aiSendBtn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '.55'; }
            _aiSetStatus('warn', '⏳ Memproses...');
            const typing = _aiShowTyping();
            _aiScrollBottom();

            const enriched = _aiEnrich(text);
            _aiConv.push({ role: 'user', content: enriched });

            try {
                const reply = await _aiCallAPI(_aiConv, 900);
                _aiConv.push({ role: 'assistant', content: reply });
                typing.remove();
                _aiAddMsg('bot', reply);
                _aiSetStatus('ok', '✓ ' + (_AI[_aiProv]?.label || _aiProv));
                _aiScrollBottom();
            } catch(err) {
                typing.remove();
                const isRate = /rate.?limit|429|quota/i.test(err.message);
                const errMsg = isRate
                    ? `⚠️ Rate limit tercapai di ${_AI[_aiProv]?.label}. Coba ganti provider lain.`
                    : `⚠️ Error: ${err.message}`;
                _aiAddMsg('bot', errMsg);
                _aiSetStatus('err', isRate ? '✗ Rate limit' : '✗ Error');
                _aiScrollBottom();
            } finally {
                _aiBusy = false;
                if (sendBtn) {
                    sendBtn.disabled = !document.getElementById('aiChatInput')?.value.trim();
                    sendBtn.style.opacity = sendBtn.disabled ? '.55' : '1';
                }
            }
        }

        function _aiEnrich(q) {
            const ql = q.toLowerCase();
            let extra = '';
            if (/channel|wholesaler|retail|mti|nka/i.test(ql)) {
                const chMap = {};
                (rawData||[]).forEach(r => {
                    const ch=(r.Channel||'').toUpperCase();
                    if(!chMap[ch]) chMap[ch]={MTD:0,BP:0};
                    chMap[ch].MTD+=Number(r.MTD||0); chMap[ch].BP+=Number(r.BP||0);
                });
                extra += '\n\nDATA CHANNEL:\n' + Object.entries(chMap)
                    .map(([ch,v])=>`${ch}: Ach ${v.BP>0?(v.MTD/v.BP*100).toFixed(1):'-'}%, Gap ${_aiFmtRp(v.MTD-v.BP)}`).join('\n');
            }
            if (/proses|cr |kpi|visit|ca |sku|ec /i.test(ql)) {
                extra += '\n\nKPI PROSES:\n' + (_aiProses||[]).map(d=>
                    `${d.szname}: CR ${d['A_CR']}/${d.CR}(${((d['%CR']||0)*100).toFixed(0)}%), CA ${((d['%CA']||0)*100).toFixed(0)}%, SKU ${(d['A_AvgSKU']||0).toFixed(1)}`
                ).join('\n');
            }
            if (/lob|principle|brand/i.test(ql)) {
                const prMap={};
                (window.catBpData||[]).forEach(r=>{
                    const pr=r.Principle||'Other';
                    if(!prMap[pr]) prMap[pr]={MTD:0,BP:0};
                    prMap[pr].MTD+=Number(r.MTD||0); prMap[pr].BP+=Number(r['T.BP']||0);
                });
                extra += '\n\nDATA LOB/PRINCIPLE:\n' + Object.entries(prMap)
                    .map(([nm,v])=>`${nm}: Ach ${v.BP>0?(v.MTD/v.BP*100).toFixed(1):'-'}%, Gap ${_aiFmtRp(v.MTD-v.BP)}`).join('\n');
            }
            if (/salesman|ranking|achievement|ach/i.test(ql)) {
                const smMap={};
                (rawData||[]).forEach(r=>{
                    const sm=r['Nama Salesman']||''; if(!sm) return;
                    if(!smMap[sm]) smMap[sm]={MTD:0,BP:0};
                    smMap[sm].MTD+=Number(r.MTD||0); smMap[sm].BP+=Number(r.BP||0);
                });
                extra += '\n\nPERFORMANCE SALESMAN:\n' + Object.entries(smMap)
                    .sort((a,b)=>(b[1].BP>0?b[1].MTD/b[1].BP:0)-(a[1].BP>0?a[1].MTD/a[1].BP:0))
                    .map(([nm,v],i)=>`#${i+1} ${nm}: Ach ${v.BP>0?(v.MTD/v.BP*100).toFixed(1):'-'}%, Gap ${_aiFmtRp(v.MTD-v.BP)}`).join('\n');
            }
            return extra ? q + '\n\n[DATA KONTEKS:' + extra + ']' : q;
        }

        function _aiAddMsg(role, text) {
            const wrap = document.getElementById('aiChatMessages');
            if (!wrap) return;
            const prov = _AI[_aiProv];
            const tagClr = { groq:{bg:'#fed7aa',fg:'#c2410c'}, gemini:{bg:'#bfdbfe',fg:'#1d4ed8'}, gemini15pro:{bg:'#dbeafe',fg:'#1a73e8'}, openrouter:{bg:'#ede9fe',fg:'#7c3aed'}, cohere:{bg:'#fef3c7',fg:'#d97706'}, auto:{bg:'#dcfce7',fg:'#16a34a'} };
            const tc = tagClr[_aiProv] || {bg:'#e2e8f0',fg:'#475569'};
            const provTag = role === 'bot'
                ? `<span style="font-size:9px;background:${tc.bg};color:${tc.fg};padding:1px 6px;border-radius:8px;">${prov?.label||_aiProv}</span>`
                : '';
            const div = document.createElement('div');
            div.className = 'ai-msg ' + role;
            div.innerHTML = `<div class="ai-label">${role==='user'?'Anda':'AI Insight'} ${provTag}</div>
                <div class="ai-bubble">${_aiFmtText(text)}</div>`;
            wrap.appendChild(div);
            return div;
        }

        function _aiShowTyping() {
            const wrap = document.getElementById('aiChatMessages');
            const div = document.createElement('div');
            div.className = 'ai-msg bot';
            div.innerHTML = `<div class="ai-label">AI Insight</div>
                <div class="ai-typing"><div class="ai-dot"></div><div class="ai-dot"></div><div class="ai-dot"></div></div>`;
            wrap?.appendChild(div);
            return div;
        }

        // ── API Calls ─────────────────────────────────────────────────
        async function _aiCallAPI(messages, maxTokens=800) {
            if (_aiProv === 'auto')       return _aiCallAuto(messages, maxTokens);
            if (_aiProv === 'gemini')     return _aiCallGemini(messages, maxTokens);
            if (_aiProv === 'gemini15pro') return _aiCallGemini15Pro(messages, maxTokens);
            if (_aiProv === 'openrouter') return _aiCallOR(messages, maxTokens);
            if (_aiProv === 'cohere')     return _aiCallCohere(messages, maxTokens);
            return _aiCallGroq(messages, maxTokens);
        }

        function _aiSysPrompt() {
            const smMap={};
            (rawData||[]).forEach(r=>{
                const sm=r['Nama Salesman']||''; if(!sm) return;
                if(!smMap[sm]) smMap[sm]={MTD:0,BP:0};
                smMap[sm].MTD+=Number(r.MTD||0); smMap[sm].BP+=Number(r.BP||0);
            });
            const totMTD=Object.values(smMap).reduce((s,v)=>s+v.MTD,0);
            const totBP=Object.values(smMap).reduce((s,v)=>s+v.BP,0);
            const depoName = selectedDepo.replace('data_DEPO_','').replace(/_/g,' ');
            const smList = Object.entries(smMap).map(([nm,v],i)=>`${nm}: Ach ${v.BP>0?(v.MTD/v.BP*100).toFixed(1):'-'}%`).join(', ');
            return `Kamu adalah AI analis sales profesional senior untuk Depo ${depoName}.
Total Achievement: ${totBP>0?(totMTD/totBP*100).toFixed(1):'-'}%, Gap: ${_aiFmtRp(totMTD-totBP)}.
Salesman aktif: ${smList}.
${_aiCtx()}
Tugas utamamu: identifikasi masalah, temukan root cause, buat activity plan konkret dengan timeline dan PIC, serta quick wins.
Jawab dalam Bahasa Indonesia profesional. Selalu sebutkan angka/nama spesifik. Untuk activity plan, output wajib berupa JSON array dengan field: aksi, PIC, timeline, target.`;
        }

        async function _aiCallGroq(messages, maxTokens) {
            const key = _AI.groq.key;
            if (!key) throw new Error('Groq API key belum diisi. Klik ⚙️ API Key untuk mengatur.');
            const res = await fetch(_AI.groq.url, {
                method:'POST',
                headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+key },
                body: JSON.stringify({ model:_AI.groq.model, messages:[{role:'system',content:_aiSysPrompt()},...messages], max_tokens:maxTokens, temperature:0.3 })
            });
            if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Groq HTTP ${res.status}`); }
            const d = await res.json();
            return d.choices?.[0]?.message?.content || '(tidak ada respons)';
        }

        async function _aiCallGemini(messages, maxTokens) {
            const key = _AI.gemini.key;
            if (!key) throw new Error('Gemini API key belum diisi. Klik ⚙️ API Key untuk mengatur.');
            const contents = messages.map(m=>({ role:m.role==='assistant'?'model':'user', parts:[{text:m.content}] }));
            const res = await fetch(_AI.gemini.url + '?key=' + key, {
                method:'POST',
                headers:{ 'Content-Type':'application/json' },
                body: JSON.stringify({
                    system_instruction:{ parts:[{text:_aiSysPrompt()}] },
                    contents,
                    generationConfig:{ maxOutputTokens:maxTokens, temperature:0.3 }
                })
            });
            if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Gemini HTTP ${res.status}`); }
            const d = await res.json();
            return d.candidates?.[0]?.content?.parts?.[0]?.text || '(tidak ada respons)';
        }

        async function _aiCallOR(messages, maxTokens) {
            const key = _AI.openrouter.key;
            if (!key) throw new Error('OpenRouter API key belum diisi. Klik ⚙️ API Key untuk mengatur.');
            const model = _AI.openrouter.model;
            const res = await fetch(_AI.openrouter.url, {
                method:'POST',
                headers:{
                    'Content-Type':'application/json',
                    'Authorization':'Bearer '+key,
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'OneSheet AI Insight'
                },
                body: JSON.stringify({ model, messages:[{role:'system',content:_aiSysPrompt()},...messages], max_tokens:maxTokens, temperature:0.3 })
            });
            if (!res.ok) {
                const e=await res.json().catch(()=>({}));
                if (res.status===404) throw new Error(`Model "${model}" tidak ditemukan. Buka ⚙️ API Key → pilih model lain (Qwen3 235B atau Llama 3.3 70B paling stabil).`);
                if (res.status===401) throw new Error('OpenRouter API key tidak valid. Cek kembali di ⚙️ API Key.');
                if (res.status===429) throw new Error('Rate limit OpenRouter. Tunggu 1 menit atau ganti model.');
                if (res.status===503) throw new Error(`Model "${model}" sedang overload. Coba model lain di ⚙️ API Key.`);
                throw new Error(e.error?.message||`OpenRouter HTTP ${res.status}`);
            }
            const d = await res.json();
            return d.choices?.[0]?.message?.content || '(tidak ada respons)';
        }

        async function _aiCallGemini15Pro(messages, maxTokens) {
            const key = _AI.gemini15pro.key;
            if (!key) throw new Error('Gemini API key belum diisi. Klik ⚙️ API Key untuk mengatur. (Key sama dengan Gemini 2.0)');
            const contents = messages.map(m=>({ role:m.role==='assistant'?'model':'user', parts:[{text:m.content}] }));
            const res = await fetch(_AI.gemini15pro.url + '?key=' + key, {
                method:'POST',
                headers:{ 'Content-Type':'application/json' },
                body: JSON.stringify({
                    system_instruction:{ parts:[{text:_aiSysPrompt()}] },
                    contents,
                    generationConfig:{ maxOutputTokens:maxTokens, temperature:0.3 }
                })
            });
            if (!res.ok) { const e=await res.json().catch(()=>({})); throw new Error(e.error?.message||`Gemini 1.5 Pro HTTP ${res.status}`); }
            const d = await res.json();
            return d.candidates?.[0]?.content?.parts?.[0]?.text || '(tidak ada respons)';
        }

        async function _aiCallCohere(messages, maxTokens) {
            const key = _AI.cohere.key;
            if (!key) throw new Error('Cohere API key belum diisi. Klik ⚙️ API Key untuk mengatur.');
            const sys = _aiSysPrompt();
            const msgs = [{ role:'system', content: sys }, ...messages];
            const res = await fetch(_AI.cohere.url, {
                method:'POST',
                headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+key },
                body: JSON.stringify({ model:_AI.cohere.model, messages:msgs, max_tokens:maxTokens, temperature:0.3 })
            });
            if (!res.ok) {
                const e=await res.json().catch(()=>({}));
                if (res.status===401) throw new Error('Cohere API key tidak valid. Cek kembali di ⚙️ API Key.');
                if (res.status===429) throw new Error('Rate limit Cohere. Tunggu sebentar atau ganti provider lain.');
                throw new Error(e.message||`Cohere HTTP ${res.status}`);
            }
            const d = await res.json();
            return d.message?.content?.[0]?.text || '(tidak ada respons)';
        }

        async function _aiCallAuto(messages, maxTokens) {
            const order = [
                { name:'groq',       fn: ()=>_aiCallGroq(messages, maxTokens) },
                { name:'gemini',     fn: ()=>_aiCallGemini(messages, maxTokens) },
                { name:'gemini15pro',fn: ()=>_aiCallGemini15Pro(messages, maxTokens) },
                { name:'openrouter', fn: ()=>_aiCallOR(messages, maxTokens) },
                { name:'cohere',     fn: ()=>_aiCallCohere(messages, maxTokens) }
            ];
            const errors = [];
            for (const { name, fn } of order) {
                if (!_AI[name]?.key) continue;
                try {
                    const result = await fn();
                    _aiSetStatus('ok', `✓ Auto → ${_AI[name].label}`);
                    return result;
                } catch(err) {
                    errors.push(`${_AI[name].label}: ${err.message}`);
                }
            }
            throw new Error('Semua provider gagal:\n' + errors.join('\n'));
        }

        async function aiSavePNG() {
            if (!_aiLastData) { alert('Belum ada data analisis. Jalankan analisis dulu.'); return; }

            const data     = _aiLastData;
            const depoName = (selectedDepo||'').replace('data_DEPO_','').replace(/_/g,' ');
            const dateStr  = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
            _aiSetStatus('warn','⏳ Membuat PNG...');

            // ── Konstanta ─────────────────────────────────────────────────────
            const W    = 960, S = 2, PAD = 20, GAP = 10, FONT = 'Arial';
            const INNER = W - PAD * 2;
            const LH = 22, LH_S = 20, CHDR = 40;
            const fBody = `14px ${FONT}`, fSm = `13px ${FONT}`, fSmB = `bold 13px ${FONT}`, fHdr = `bold 14px ${FONT}`;

            // ── Data ──────────────────────────────────────────────────────────
            const ringkasan = String(data.ringkasan || '-');
            const causes    = (data.root_cause || data.masalah || []).map(String);
            const plans     = data.activity_plan || [];
            const wins      = (data.quick_wins  || data.rekomendasi || []).map(String);

            // ── Helpers ───────────────────────────────────────────────────────
            function wrap(ctx, txt, maxW) {
                const words = txt.replace(/\n/g,' ').split(' ').filter(Boolean);
                const lines = []; let line = '';
                for (const w of words) {
                    const t = line ? `${line} ${w}` : w;
                    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
                    else line = t;
                }
                if (line) lines.push(line);
                return lines.length ? lines : [''];
            }
            const wH = (ctx, txt, maxW, lh) => wrap(ctx, txt, maxW).length * lh;

            function drawWrap(ctx, txt, x, y, maxW, lh, color) {
                if (color) ctx.fillStyle = color;
                wrap(ctx, txt, maxW).forEach((l,i) => ctx.fillText(l, x, y + i * lh));
                return wrap(ctx, txt, maxW).length;
            }

            function hline(ctx, y, x0=0, x1=W, color='#e2e8f0', lw=0.5) {
                ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=lw;
                ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); ctx.restore();
            }
            function vline(ctx, x, y0, y1, color='#e2e8f0', lw=0.5) {
                ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=lw;
                ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); ctx.restore();
            }

            // ── Phase 1: ukur tinggi semua card ───────────────────────────────
            const mc = document.createElement('canvas');
            mc.width = W; mc.height = 10;
            const mx = mc.getContext('2d');

            // Card 1 — Ringkasan
            mx.font = fBody;
            const ring_h = CHDR + wH(mx, ringkasan, INNER, LH) + PAD * 2;

            // Card 2 — Root Cause (bullet list)
            let rc_bh = PAD;
            causes.forEach((c, i) => {
                mx.font = fSmB; const pw = mx.measureText(`RC${i+1}: `).width;
                mx.font = fSm;  rc_bh += wH(mx, c, INNER - 16 - pw, LH_S) + 8;
            });
            const rc_h = causes.length ? CHDR + rc_bh + PAD : 0;

            // Card 3 — Activity Plan (tabel)
            const COL = [INNER * 0.52, INNER * 0.24, INNER * 0.24];
            const TH_H = 36;
            const rowH = plans.map(p => {
                mx.font = fSm;  const n1 = wrap(mx, p.aksi   ||'-', COL[0]-16).length;
                mx.font = fSmB; const n2 = wrap(mx, p.PIC    ||'-', COL[1]-16).length;
                                const n3 = wrap(mx, p.target ||'-', COL[2]-16).length;
                return Math.max(n1, n2, n3) * LH_S + 16;
            });
            const plan_h = plans.length ? CHDR + TH_H + rowH.reduce((a,b)=>a+b,0) + 1 : 0;

            // Card 4 — Quick Wins (bullet list)
            let qw_bh = PAD;
            wins.forEach(w => {
                mx.font = fSm;
                const pw = mx.measureText('✅ ').width;
                qw_bh += wH(mx, w, INNER - 16 - pw, LH_S) + 8;
            });
            const qw_h = wins.length ? CHDR + qw_bh + PAD : 0;

            const HDR_H  = 72;
            const sections = [ring_h, rc_h, plan_h, qw_h].filter(h => h > 0);
            const totalH = HDR_H + sections.reduce((a,h) => a + h + GAP, 0) + GAP;

            // ── Phase 2: buat canvas & gambar ─────────────────────────────────
            const cv  = document.createElement('canvas');
            cv.width  = W * S; cv.height = totalH * S;
            const ctx = cv.getContext('2d');
            ctx.scale(S, S);

            // Background
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(0, 0, W, totalH);

            // Header utama
            ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, W, HDR_H);
            ctx.font = `bold 20px ${FONT}`; ctx.fillStyle = '#ffffff';
            ctx.fillText(`AI Insight — Depo ${depoName}`, PAD, 34);
            ctx.font = `14px ${FONT}`; ctx.fillStyle = '#94a3b8';
            ctx.fillText(`Tanggal: ${dateStr}`, PAD, 56);
            ctx.textAlign = 'right';
            ctx.fillText(`Created By AI RSF`, W - PAD, 56);
            ctx.textAlign = 'left';

            // Helper: gambar card box + header band
            function cardBase(y, h, bandColor, icon, title) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, y, W, h);
                ctx.fillStyle = bandColor;
                ctx.fillRect(0, y, W, CHDR);
                hline(ctx, y + CHDR, 0, W, bandColor === '#ffffff' ? '#e2e8f0' : bandColor, 1);
                ctx.font = fHdr; ctx.fillStyle = '#1e293b';
                ctx.fillText(`${icon}  ${title}`, PAD, y + 26);
            }

            let cy = HDR_H + GAP;

            // ── Card 1: Ringkasan Kondisi ─────────────────────────────────────
            cardBase(cy, ring_h, '#e0f7fa', '📊', 'Ringkasan Kondisi');
            ctx.font = fBody;
            drawWrap(ctx, ringkasan, PAD, cy + CHDR + PAD + 14, INNER, LH, '#1f2937');
            cy += ring_h + GAP;

            // ── Card 2: Root Cause Analysis ───────────────────────────────────
            if (rc_h) {
                cardBase(cy, rc_h, '#fce4ec', '🔍', 'Root Cause Analysis');
                let bY = cy + CHDR + PAD + LH_S;
                causes.forEach((c, i) => {
                    const prefix = `RC${i+1}: `;
                    ctx.font = fSmB; const pw = ctx.measureText(prefix).width;
                    ctx.fillStyle = '#ad1457'; ctx.fillText(prefix, PAD + 8, bY);
                    ctx.font = fSm;
                    const lines = wrap(ctx, c, INNER - 16 - pw);
                    lines.forEach((l, li) => {
                        ctx.fillStyle = '#374151';
                        ctx.fillText(l, PAD + 8 + pw, bY + li * LH_S);
                    });
                    bY += lines.length * LH_S + 8;
                });
                cy += rc_h + GAP;
            }

            // ── Card 3: Activity Plan ─────────────────────────────────────────
            if (plan_h) {
                cardBase(cy, plan_h, '#e3f2fd', '📋', 'Activity Plan');

                // Thead
                const thY = cy + CHDR;
                ctx.fillStyle = '#eff6ff'; ctx.fillRect(0, thY, W, TH_H);
                hline(ctx, thY, 0, W, '#bfdbfe', 1);
                hline(ctx, thY + TH_H, 0, W, '#bfdbfe', 1);
                vline(ctx, COL[0], thY, thY + TH_H, '#bfdbfe', 1);
                vline(ctx, COL[0] + COL[1], thY, thY + TH_H, '#bfdbfe', 1);
                ctx.font = fSmB; ctx.fillStyle = '#1e40af';
                ctx.fillText('Tindakan',              PAD + 4,                    thY + 23);
                ctx.fillText('PIC',                   COL[0] + 8,                 thY + 23);
                ctx.fillText('Target',                COL[0] + COL[1] + 8,        thY + 23);

                // Rows
                let tY = thY + TH_H;
                plans.forEach((p, ri) => {
                    const rh = rowH[ri];
                    ctx.fillStyle = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
                    ctx.fillRect(0, tY, W, rh);
                    hline(ctx, tY + rh);
                    vline(ctx, COL[0],           tY, tY + rh);
                    vline(ctx, COL[0] + COL[1],  tY, tY + rh);

                    const cy2 = tY + 8 + LH_S;
                    ctx.font = fSm;
                    drawWrap(ctx, p.aksi   ||'-', PAD + 4,               cy2, COL[0]-18, LH_S, '#374151');
                    ctx.font = fSmB;
                    drawWrap(ctx, p.PIC    ||'-', COL[0] + 8,            cy2, COL[1]-18, LH_S, '#0d47a1');
                    drawWrap(ctx, p.target ||'-', COL[0]+COL[1] + 8,     cy2, COL[2]-18, LH_S, '#2e7d32');
                    tY += rh;
                });
                cy += plan_h + GAP;
            }

            // ── Card 4: Quick Wins ────────────────────────────────────────────
            if (qw_h) {
                cardBase(cy, qw_h, '#f3e8ff', '⚡', 'Quick Wins (Segera Lakukan)');
                let qY = cy + CHDR + PAD + LH_S;
                wins.forEach(w => {
                    const prefix = '✅ ';
                    ctx.font = fSm; const pw = ctx.measureText(prefix).width;
                    ctx.fillStyle = '#374151'; ctx.fillText(prefix, PAD + 8, qY);
                    const lines = wrap(ctx, w, INNER - 16 - pw);
                    lines.forEach((l, li) => ctx.fillText(l, PAD + 8 + pw, qY + li * LH_S));
                    qY += lines.length * LH_S + 8;
                });
            }

            // ── Download ──────────────────────────────────────────────────────
            const link    = document.createElement('a');
            link.download = `AI_Insight_${depoName}_${new Date().toISOString().slice(0,10)}.png`;
            link.href     = cv.toDataURL('image/png');
            link.click();
            _aiSetStatus('ok', '✓ PNG tersimpan (HD)');
        }

        // ── Save Excel ────────────────────────────────────────────────
        function aiSaveExcel() {
            if (!_aiLastData) { alert('Belum ada data analisis. Jalankan analisis dulu.'); return; }
            if (!window.XLSX) { alert('Library XLSX tidak tersedia.'); return; }
            const depoName = (selectedDepo || '').replace('data_DEPO_','').replace(/_/g,' ');
            const dateStr = new Date().toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
            const d = _aiLastData;
            const rc = d.root_cause || [];
            const ap = d.activity_plan || [];
            const qw = d.quick_wins || [];

            const aoa = [];
            const merges = [];
            let r = 0;

            const addMerged = (texts, span) => {
                const row = [texts[0]];
                for (let i = 1; i < span; i++) row.push('');
                aoa.push(row);
                merges.push({ s:{r,c:0}, e:{r,c:span-1} });
                r++;
            };

            addMerged([`AI Insight — Depo ${depoName}`], 3);
            addMerged([`Tanggal: ${dateStr}`], 3);
            aoa.push(['']); r++;
            addMerged(['RINGKASAN'], 3);
            addMerged([d.ringkasan || '-'], 3);
            aoa.push(['']); r++;
            addMerged(['ROOT CAUSE ANALYSIS'], 3);
            // RC items: max 3 per row, grouped
            for (let i = 0; i < rc.length; i += 3) {
                aoa.push([
                    rc[i]   ? `RC${i+1}: ${rc[i]}`   : '',
                    rc[i+1] ? `RC${i+2}: ${rc[i+1]}` : '',
                    rc[i+2] ? `RC${i+3}: ${rc[i+2]}` : ''
                ]);
                r++;
            }
            aoa.push(['']); r++;
            // Activity Plan
            addMerged(['ACTIVITY PLAN'], 3);
            aoa.push(['Tindakan', 'PIC', 'Target']); r++;
            ap.forEach(p => { aoa.push([p.aksi||'-', p.PIC||'-', p.target||'-']); r++; });
            aoa.push(['']); r++;
            addMerged(['Quick Wins'], 3);
            for (let i = 0; i < qw.length; i += 3) {
                aoa.push([
                    qw[i]   ? `${i+1}. ${qw[i]}`   : '',
                    qw[i+1] ? `${i+2}. ${qw[i+1]}` : '',
                    qw[i+2] ? `${i+3}. ${qw[i+2]}` : ''
                ]);
                r++;
            }

            const ws = XLSX.utils.aoa_to_sheet(aoa);
            ws['!merges'] = merges;
            ws['!cols']   = [{ wch:42 }, { wch:20 }, { wch:28 }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'AI Insight');
            XLSX.writeFile(wb, `AI_Insight_${depoName}_${new Date().toISOString().slice(0,10)}.xlsx`);
            _aiSetStatus('ok', '✓ Excel tersimpan');
        }

        // ── Refresh ───────────────────────────────────────────────────
        function aiRefreshInsight() {
            _aiConv = [];
            _aiProses = null;
            document.getElementById('aiInsightCards').innerHTML = '';
            document.getElementById('aiChatMessages').innerHTML = '';
            document.getElementById('aiChatDivider').style.display = 'none';
            document.getElementById('aiChipRow').style.display = 'none';
            const send = document.getElementById('aiSendBtn');
            if (send) { send.disabled = true; send.style.opacity = '.55'; }
            _aiAnalyze();
        }

        // ── Settings ──────────────────────────────────────────────────
        function aiOpenSettings() {
            document.getElementById('aiGK').value    = _AI.groq.key;
            document.getElementById('aiGemK').value  = _AI.gemini.key;
            document.getElementById('aiOrK').value   = _AI.openrouter.key;
            document.getElementById('aiCohK').value  = _AI.cohere.key;
            const sel = document.getElementById('aiOrModel');
            if (sel) sel.value = _AI.openrouter.model;
            const overlay = document.getElementById('aiSettingsOverlay');
            if (overlay) overlay.style.display = 'flex';
        }

        function aiCloseSettings() {
            const overlay = document.getElementById('aiSettingsOverlay');
            if (overlay) overlay.style.display = 'none';
        }

        function aiToggleKey(id, btn) {
            const el = document.getElementById(id);
            if (!el) return;
            el.type = el.type === 'password' ? 'text' : 'password';
            btn.textContent = el.type === 'password' ? '👁' : '🙈';
        }

        // ── Load model list dari OpenRouter API (real-time) ───────────
        async function aiLoadOrModels() {
            const btn = document.getElementById('aiOrLoadBtn');
            const status = document.getElementById('aiOrModelStatus');
            const sel = document.getElementById('aiOrModel');
            if (btn) { btn.textContent = '⏳ Memuat...'; btn.disabled = true; }
            if (status) status.textContent = '⏳ Mengambil daftar model dari OpenRouter...';
            try {
                const res = await fetch('https://openrouter.ai/api/v1/models');
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                const models = (data.data || [])
                    .filter(m => {
                        const p = m.pricing || {};
                        return (parseFloat(p.prompt||'1') === 0 && parseFloat(p.completion||'1') === 0);
                    })
                    .sort((a,b) => (b.context_length||0) - (a.context_length||0));

                if (!models.length) throw new Error('Tidak ada model free yang ditemukan');

                // Kategorikan berdasarkan nama
                const priority = ['deepseek','qwen','llama','gemma','mistral','claude','gpt'];
                const tagged = models.map(m => {
                    const id = m.id || '';
                    const name = (m.name || id).replace(':free','').slice(0,50);
                    const ctx = m.context_length ? ` [${(m.context_length/1000).toFixed(0)}K ctx]` : '';
                    const score = priority.findIndex(p => id.toLowerCase().includes(p));
                    return { id, label: name + ctx + ' (free)', score: score === -1 ? 99 : score };
                }).sort((a,b) => a.score - b.score || a.id.localeCompare(b.id));

                const saved = localStorage.getItem('ai_model_openrouter') || '';
                sel.innerHTML = tagged.map(m =>
                    `<option value="${m.id}" ${m.id === saved ? 'selected' : ''}>${m.label}</option>`
                ).join('');

                if (status) status.innerHTML = `✅ <b>${models.length} model free</b> berhasil dimuat. Pilih model lalu klik 💾 Simpan.`;
            } catch(err) {
                if (status) status.innerHTML = `⚠️ Gagal: ${err.message}. Gunakan input manual di bawah.`;
            } finally {
                if (btn) { btn.textContent = '🔄 Muat Model Terbaru'; btn.disabled = false; }
            }
        }

        function aiApplyManualModel() {
            const manual = document.getElementById('aiOrModelManual')?.value.trim();
            if (!manual) return;
            const sel = document.getElementById('aiOrModel');
            // Tambah option baru jika belum ada
            let opt = [...(sel?.options||[])].find(o => o.value === manual);
            if (!opt && sel) {
                opt = new Option(`✏️ ${manual} (manual)`, manual);
                sel.insertBefore(opt, sel.firstChild);
            }
            if (sel) sel.value = manual;
            const status = document.getElementById('aiOrModelStatus');
            if (status) status.innerHTML = `✅ Model ID <b>${manual}</b> siap digunakan. Klik 💾 Simpan.`;
        }

        function aiSaveSettings() {
            const gk  = document.getElementById('aiGK')?.value.trim();
            const gmk = document.getElementById('aiGemK')?.value.trim();
            const ork = document.getElementById('aiOrK')?.value.trim();
            const cok = document.getElementById('aiCohK')?.value.trim();
            const orm = document.getElementById('aiOrModel')?.value;
            if (gk)  localStorage.setItem('ai_key_groq', gk);       else localStorage.removeItem('ai_key_groq');
            if (gmk) localStorage.setItem('ai_key_gemini', gmk);     else localStorage.removeItem('ai_key_gemini');
            if (ork) localStorage.setItem('ai_key_openrouter', ork); else localStorage.removeItem('ai_key_openrouter');
            if (cok) localStorage.setItem('ai_key_cohere', cok);     else localStorage.removeItem('ai_key_cohere');
            if (orm) localStorage.setItem('ai_model_openrouter', orm);
            aiCloseSettings();
            _aiSetStatus('ok', '✓ Key tersimpan');
            if (!document.getElementById('aiInsightCards').children.length) _aiAnalyze();
        }

        // ── UI Helpers ────────────────────────────────────────────────
        function aiHandleKey(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSendMessage(); }
        }
        function aiAutoResize(el) {
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 80) + 'px';
        }
        function aiToggleSend() {
            const btn = document.getElementById('aiSendBtn');
            const val = document.getElementById('aiChatInput')?.value.trim();
            if (btn) { btn.disabled = !val || _aiBusy; btn.style.opacity = (btn.disabled ? '.55' : '1'); }
        }
        function _aiScrollBottom() {
            const msgs = document.getElementById('aiChatMessages');
            if (msgs) setTimeout(()=>msgs.scrollTo({ top:msgs.scrollHeight, behavior:'smooth' }), 80);
        }
        function _aiFmtRp(num) {
            if (!num && num !== 0) return '-';
            const abs=Math.abs(num), sign=num<0?'-':'';
            if (abs>=1e9) return sign+'Rp '+(abs/1e9).toFixed(1)+'M';
            if (abs>=1e6) return sign+'Rp '+(abs/1e6).toFixed(0)+'jt';
            return sign+'Rp '+abs.toLocaleString('id-ID');
        }
        function _aiFmtText(text) {
            return _aiEsc(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');
        }
        function _aiEsc(str) {
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }

        // Expose AI functions globally agar dapat dipanggil dari onclick HTML
        window.aiSwitchProvider  = aiSwitchProvider;
        window.aiSendMessage     = aiSendMessage;
        window.aiAskChip         = aiAskChip;
        window.aiHandleKey       = aiHandleKey;
        window.aiAutoResize      = aiAutoResize;
        window.aiToggleSend      = aiToggleSend;
        window.aiRefreshInsight  = aiRefreshInsight;
        window.aiOpenSettings    = aiOpenSettings;
        window.aiCloseSettings   = aiCloseSettings;
        window.aiToggleKey       = aiToggleKey;
        window.aiSaveSettings    = aiSaveSettings;
        window.aiLoadOrModels    = aiLoadOrModels;
        window.aiApplyManualModel= aiApplyManualModel;
        window.aiSavePNG         = aiSavePNG;
        window.aiSaveExcel       = aiSaveExcel;
