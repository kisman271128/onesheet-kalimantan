@echo off
echo ============================================
echo   ONESHEET KALIMANTAN - UPDATE DATA DEPO
echo ============================================
echo.

REM ========================================
REM CONFIGURATION
REM ========================================
set GITHUB_USERNAME=kisman271128
set GITHUB_REPO=onesheet-kalimantan
set GIT_BRANCH=master
set PY_SCRIPT=excel_to_json_depo.py
set EXCEL_FILE=OneSheetDepo.xlsb

REM ========================================
REM [1/4] CEK FILE EXCEL
REM ========================================
echo [1/4] Memeriksa file Excel...
if not exist "%EXCEL_FILE%" (
    echo ERROR: File %EXCEL_FILE% tidak ditemukan!
    echo Pastikan file ada di folder yang sama dengan file BAT ini.
    pause
    exit /b 1
)
echo + %EXCEL_FILE% ditemukan

REM ========================================
REM [2/4] DOWNLOAD .PY TERBARU DARI GITHUB
REM ========================================
echo.
echo [2/4] Mengunduh script terbaru dari GitHub...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$url = 'https://raw.githubusercontent.com/%GITHUB_USERNAME%/%GITHUB_REPO%/%GIT_BRANCH%/%PY_SCRIPT%';" ^
  "$out = '%PY_SCRIPT%';" ^
  "try {" ^
  "  $wc = New-Object System.Net.WebClient;" ^
  "  $wc.DownloadFile($url, $out);" ^
  "  Write-Host '  + Script terbaru berhasil diunduh' -ForegroundColor Green" ^
  "} catch {" ^
  "  if (Test-Path $out) {" ^
  "    Write-Host '  ⚠ Gagal unduh, menggunakan script lokal yang ada' -ForegroundColor Yellow" ^
  "  } else {" ^
  "    Write-Host '  ERROR: Tidak ada koneksi dan script lokal tidak ditemukan!' -ForegroundColor Red;" ^
  "    exit 1" ^
  "  }" ^
  "}"

if errorlevel 1 (
    echo ERROR: Script tidak tersedia!
    pause
    exit /b 1
)

REM ========================================
REM [3/4] CEK PYTHON & DEPENDENCIES
REM ========================================
echo.
echo [3/4] Memeriksa Python dan dependencies...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python tidak terinstall!
    pause
    exit /b 1
)
pip show pandas >nul 2>&1
if errorlevel 1 ( pip install pandas --quiet --break-system-packages )
pip show pyxlsb >nul 2>&1
if errorlevel 1 ( pip install pyxlsb --quiet --break-system-packages )
echo + Siap

REM ========================================
REM [4/4] JALANKAN EXPORT
REM ========================================
echo.
echo [4/4] Menjalankan export data...
echo.
python %PY_SCRIPT%

if errorlevel 1 (
    echo.
    echo ============================================
    echo   ERROR saat export! Cek pesan di atas.
    echo ============================================
    pause
    exit /b 1
)

echo.
echo ============================================
echo   SELESAI! Silakan upload data via
echo   tab "Upload Data" di aplikasi.
echo ============================================
echo.
pause
