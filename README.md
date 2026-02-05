# OneSheet Region Kalimantan - Web Application

Aplikasi web untuk menampilkan data OneSheet Region Kalimantan dengan sistem autentikasi dan filtering data.

## 🚀 Fitur

- ✅ Login dengan username dan password terenkripsi
- ✅ Filter data berdasarkan Region, Depo, dan Channel
- ✅ Tampilan data dinamis dari file JSON
- ✅ Auto-refresh setiap 5 menit
- ✅ Responsive design untuk mobile dan desktop
- ✅ Color-coded cells berdasarkan performance
- ✅ Data tersimpan di GitHub untuk akses multi-cabang

## 📋 Requirements

### Software yang Dibutuhkan:
1. **Python 3.7+** - [Download](https://www.python.org/downloads/)
2. **Git** - [Download](https://git-scm.com/downloads/)
3. **Akun GitHub** - [Daftar](https://github.com/signup)

### Python Libraries:
```bash
pip install pandas openpyxl pyxlsb
```

## 🔧 Setup dan Instalasi

### 1. Persiapan GitHub

1. Buat repository baru di GitHub:
   - Nama: `onesheet-kalimantan` (atau nama lain)
   - Set sebagai **Public**
   - Jangan centang "Initialize with README"

2. Generate Personal Access Token:
   - Go to: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Nama: `OneSheet Upload`
   - Pilih scope: `repo` (Full control of private repositories)
   - Generate dan **SIMPAN TOKEN** (akan digunakan di batch file)

### 2. Konfigurasi Batch File

Edit file `upload_to_github.bat` dan ubah bagian CONFIGURATION:

```batch
set GITHUB_USERNAME=username_github_anda
set GITHUB_REPO=onesheet-kalimantan
set GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxx
set GITHUB_EMAIL=email@anda.com
```

### 3. Konfigurasi HTML

Edit file `index.html` pada baris 346, ubah URL:

```javascript
const DATA_URL = 'https://raw.githubusercontent.com/kisman271128/one/main/data.json';
```

Ganti `USERNAME_ANDA` dan `REPO_ANDA` sesuai dengan GitHub Anda.

### 4. Setup Username & Password

Default login credentials (sudah terenkripsi di `index.html`):

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Administrator |
| user | user123 | User |
| kalimantan | kalimantan2024 | Region |

**Untuk menambah/mengubah user:**

1. Encode username dan password Anda menggunakan Base64:
   - Online: https://www.base64encode.org/
   - Atau gunakan browser console: `btoa("username_anda")`

2. Edit `index.html` bagian `validCredentials`:
```javascript
const validCredentials = {
    'YWRtaW4=': 'YWRtaW4xMjM=',
    'dXNlcg==': 'dXNlcjEyMw==',
    'bmV3dXNlcg==': 'bmV3cGFzc3dvcmQ=', // newuser:newpassword
};
```

## 🎯 Cara Penggunaan

### Upload Data Pertama Kali:

1. Letakkan file Excel `Dsource OneSheet Kalimantan.xlsb` di folder yang sama dengan script
2. Double-click `upload_to_github.bat`
3. Script akan otomatis:
   - Menginstall dependencies yang dibutuhkan
   - Convert Excel ke JSON
   - Upload ke GitHub

### Update Data Rutin:

Setiap kali ada update data Excel:
1. Replace file `Dsource OneSheet Kalimantan.xlsb` dengan versi terbaru
2. Jalankan `upload_to_github.bat`
3. Data akan otomatis terupdate di semua cabang

### Akses Website:

**Opsi 1: GitHub Pages (Recommended)**
1. Buka repository GitHub Anda
2. Go to Settings → Pages
3. Source: Deploy from a branch
4. Branch: main / root
5. Save
6. Akses di: `https://username.github.io/onesheet-kalimantan/`

**Opsi 2: Local/Server**
- Copy `index.html` ke web server Anda
- Buka di browser

**Opsi 3: Langsung dari File**
- Buka `index.html` dengan browser (Chrome/Edge/Firefox)
- Data tetap akan diambil dari GitHub

## 📊 Format Data Excel

Pastikan Excel file memiliki struktur:
- Sheet pertama berisi data
- Kolom header di baris pertama
- Minimal kolom: `region`, `depo`, `channel`
- Kolom lain akan otomatis ditampilkan

Contoh struktur:
```
| region | depo | channel | GAP | LM | BP | % Ach | ... |
|--------|------|---------|-----|----|----|-------|-----|
| KAL    | BPP  | MT      | 100 | 90 | 95 | 95%   | ... |
```

## 🎨 Customization

### Mengubah Warna Conditional Formatting

Edit di `index.html` bagian `displayData()`:

```javascript
if (value >= 100) {
    cellClass = 'cell-green';  // >= 100%
} else if (value >= 80) {
    cellClass = 'cell-yellow'; // 80-99%
} else if (value < 80) {
    cellClass = 'cell-red';    // < 80%
}
```

### Mengubah Auto-Refresh Interval

Edit di `index.html` bagian akhir (default 5 menit = 300000 ms):

```javascript
setInterval(() => {
    if (sessionStorage.getItem('loggedIn') === 'true') {
        loadData();
    }
}, 300000); // 300000 ms = 5 minutes
```

## 🔒 Keamanan

1. **Password Encryption**: Password disimpan dalam bentuk Base64 encoding
2. **Session-based Authentication**: Login hanya valid selama sesi browser
3. **GitHub Token**: Jangan share token ke orang lain
4. **Private Repository**: Gunakan private repository jika data sensitif

⚠️ **PENTING**: Untuk keamanan maksimal, pertimbangkan:
- Gunakan backend authentication (Node.js, PHP, dll)
- Simpan credentials di database
- Implement JWT atau OAuth

## 🐛 Troubleshooting

### Error: "Python tidak terinstall"
- Install Python dari https://www.python.org/downloads/
- Saat install, centang "Add Python to PATH"

### Error: "Git tidak terinstall"
- Install Git dari https://git-scm.com/downloads/

### Error: "Gagal upload ke GitHub"
- Periksa GitHub token masih valid
- Pastikan repository sudah dibuat
- Pastikan username benar

### Error: "Gagal memuat data"
- Periksa URL data.json di index.html sudah benar
- Pastikan repository public atau token valid
- Cek koneksi internet

### Data tidak update
- Clear browser cache (Ctrl + Shift + Delete)
- Hard refresh (Ctrl + F5)
- Periksa file JSON di GitHub sudah terupdate

## 📞 Support

Untuk bantuan lebih lanjut:
1. Check file log error di console browser (F12)
2. Periksa GitHub Actions/Commit history
3. Review konfigurasi di batch file

## 📝 License

Free to use and modify for your organization.

---

**Created with ❤️ for OneSheet Kalimantan Team**

Last Updated: February 2026
