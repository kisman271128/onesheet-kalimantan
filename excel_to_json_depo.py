import json
import pandas as pd
import numpy as np
import os
import math
import time

def export_tg(excel_file, actual_mtd=0, bp_mtd=0):
    """Export sheet TG ke TG_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet TG...")
        df = pd.read_excel(excel_file, sheet_name="TG", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet TG kosong, tidak ada file yang dibuat")
            return False

        if 'Depo' not in df.columns:
            print("❌ Kolom 'Depo' tidak ditemukan di sheet TG")
            print(f"Available columns: {', '.join(df.columns)}")
            return False

        # Hapus file lama TG_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('TG_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file TG_DEPO lama dihapus")

        created_files = []

        for _, row in df.iterrows():
            depo_name = row.get('Depo')
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            total_hk    = row.get('Total HK')
            hk_berjalan = row.get('HK Berjalan')
            sisa_hk     = row.get('Sisa HK')
            tg_raw      = row.get('TG')
            day_closing = row.get('Day Closing')

            # Konversi Day Closing: serial Excel → string
            if isinstance(day_closing, (int, float)) and day_closing is not None:
                try:
                    day_closing_str = (pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(day_closing))).strftime('%m/%d/%Y')
                except:
                    day_closing_str = str(day_closing)
            else:
                day_closing_str = str(day_closing) if day_closing is not None else 'N/A'

            # Hitung TG_Percentage
            if tg_raw is not None:
                try:
                    tg_f = float(tg_raw)
                    tg_pct = round(tg_f * 100, 2) if 0 <= tg_f <= 1 else round(tg_f, 2)
                except:
                    tg_pct = 0.0
            elif total_hk and hk_berjalan:
                tg_pct = round(float(hk_berjalan) / float(total_hk) * 100, 2)
            else:
                tg_pct = 0.0

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')
            filename = f"TG_DEPO_{safe_name}.json"

            mtd_selisih   = round(actual_mtd - bp_mtd, 2)
            mtd_pct_vs_bp = round(actual_mtd / bp_mtd * 100, 2) if bp_mtd else 0.0

            tg_json = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "TG",
                    "depo": depo_name,
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": {
                    "Depo":          str(depo_name),
                    "Total HK":      int(total_hk)    if total_hk    is not None else None,
                    "HK Berjalan":   int(hk_berjalan) if hk_berjalan is not None else None,
                    "Sisa HK":       int(sisa_hk)     if sisa_hk     is not None else None,
                    "TG":            float(tg_raw)    if tg_raw      is not None else None,
                    "Day Closing":   day_closing_str,
                    "TG_Percentage": tg_pct,
                    "MTD_Actual":    actual_mtd,
                    "MTD_BP":        bp_mtd,
                    "MTD_Selisih":   mtd_selisih,
                    "MTD_vs_BP_Pct": mtd_pct_vs_bp
                }
            }

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(tg_json, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} — TG: {tg_pct}% | Day Closing: {day_closing_str}")

        print(f"✅ {len(created_files)} file TG per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal membuat TG_DEPO: {str(e)}")
        return False


def export_data():
    excel_file = "OneSheetDepo.xlsb"
    sheet_name = "OneSheet"
    
    if not os.path.exists(excel_file):
        print(f"❌ File {excel_file} tidak ditemukan!")
        return False

    try:
        print("=" * 60)
        print("  EXPORT ONESHEET BY DEPO")
        print("=" * 60)
        print()
        
        # Delete old JSON files first
        print("🗑️  Menghapus file JSON lama...")
        deleted_count = 0
        for filename in os.listdir('.'):
            if not filename.endswith('.json'):
                continue
            should_delete = (
                (filename.startswith('data_'))    or
                (filename.startswith('bti_'))     or
                (filename.startswith('project_')) or
                (filename.startswith('cat_'))     or
                (filename.startswith('trend_'))   or
                (filename.startswith('bp_'))      or
                (filename.startswith('outlet_'))  or
                (filename.startswith('sku_'))     or
                (filename.startswith('proses_'))  or
                (filename.startswith('TG_DEPO_'))  or
                (filename.startswith('25outlet_cat_'))
            )
            if should_delete:
                try:
                    os.remove(filename)
                    deleted_count += 1
                except:
                    pass
        print(f"✅ {deleted_count} file lama dihapus")
        print()
        
        # 1. Read Sheet OneSheet
        print(f"📖 Membaca Sheet {sheet_name}...")
        df = pd.read_excel(excel_file, sheet_name=sheet_name, engine='pyxlsb')
        print(f"✅ Berhasil membaca {len(df)} baris")
        print()
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        # Check if 'Depo' column exists
        if 'Depo' not in df.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan!")
            print(f"Available columns: {', '.join(df.columns)}")
            return False
        
        # Replace NaN and inf values
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)
        
        # Group by Depo
        depo_groups = df.groupby('Depo')
        
        print(f"🏢 Ditemukan {len(depo_groups)} Depo:")
        print()
        
        created_files = []
        total_actual_mtd = 0.0

        for depo_name, depo_data in depo_groups:
            # Skip if depo name is None or empty
            if not depo_name or pd.isna(depo_name):
                continue

            # Convert to list of dicts
            records = depo_data.to_dict('records')
            
            # Clean any remaining NaN in records
            for record in records:
                for key, value in record.items():
                    if isinstance(value, float):
                        if math.isnan(value) or math.isinf(value):
                            record[key] = None
            
            # Create JSON structure
            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": sheet_name,
                    "depo": depo_name,
                    "total_records": len(records),
                    "columns": list(df.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": records
            }
            
            # Generate filename
            safe_depo_name = str(depo_name).upper().replace(' ', '_').replace('/', '_')
            filename = f"data_{safe_depo_name}.json"

            total_actual_mtd += sum((r.get('MTD') or 0) for r in records)

            # Write JSON file with explicit flush
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()  # Force write to disk
                os.fsync(f.fileno())  # Ensure OS writes to disk
            
            # Explicitly set modification time to NOW
            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(records)} records")
        
        print()
        print("=" * 60)
        print(f"✅ SELESAI! {len(created_files)} file JSON dibuat")
        print("=" * 60)
        print()
        
        print()
        print("Files created:")
        for f in created_files:
            print(f"  - {f}")

        return True, round(total_actual_mtd, 2)

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, 0.0

def export_project(excel_file):
    """Export sheet Project ke Project.json dan data_PROJECT_<name>.json per project"""
    try:
        print("📊 Membaca Sheet Project...")
        df = pd.read_excel(excel_file, sheet_name="Project", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet Project kosong, Project.json tidak dibuat")
            return False

        # Clean NaN in records
        records = df.to_dict('records')
        for record in records:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        # --- Split per Depo        # --- 2. Split per Depo → project_DEPO_<name>.json ---
        if 'Depo' not in df.columns:
            print("⚠️  Kolom 'Depo' tidak ditemukan, skip split per Depo")
            return True

        # Hapus file lama project_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('project_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file project_DEPO lama dihapus")

        depo_groups = df.groupby('Depo')
        created_files = []

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float):
                        if math.isnan(value) or math.isinf(value):
                            record[key] = None

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "Project",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(df.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]  # hapus "Depo " di awal
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')
            filename = f"project_DEPO_{safe_name}.json"

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file project per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export Project: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_bti(excel_file):
    """Export sheet BTI ke BTI.json (flat) dan bti_DEPO_<n>.json per Depo (split by szWorkplaceName)"""
    try:
        print("📊 Membaca Sheet BTI...")
        df = pd.read_excel(excel_file, sheet_name="BTI", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet BTI kosong, BTI.json tidak dibuat")
            return False

        # Clean NaN in records
        records = df.to_dict('records')
        for record in records:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        # --- Split per Depo berdasarkan        # --- 2. Split per Depo berdasarkan kolom szWorkplaceName ---
        if 'szWorkplaceName' not in df.columns:
            print("⚠️  Kolom 'szWorkplaceName' tidak ditemukan, skip split per Depo")
            return True

        # Hapus file lama bti_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('bti_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file bti_DEPO lama dihapus")

        depo_groups = df.groupby('szWorkplaceName')
        created_files = []

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float):
                        if math.isnan(value) or math.isinf(value):
                            record[key] = None

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "BTI",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(df.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')
            filename = f"bti_DEPO_{safe_name}.json"

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file BTI per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export BTI: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_onesheetcat(excel_file):
    """Export sheet OneSheetCat ke 2 file JSON per Depo:
       1. cat_DEPO_<n>.json          — agregat level TYPE (tanpa SzCustId)
       2. 25outlet_cat_DEPO_<n>.json — agregat level SzCustId (tanpa TYPE)
    """
    try:
        print("📊 Membaca Sheet OneSheetCat...")
        df = pd.read_excel(excel_file, sheet_name="OneSheetCat", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()

        if df.empty:
            print("⚠️  Sheet OneSheetCat kosong, tidak ada file yang dibuat")
            return False

        if 'Depo' not in df.columns:
            print("⚠️  Kolom 'Depo' tidak ditemukan")
            return False

        print(f"   {len(df)} baris dibaca, kolom: {list(df.columns)}")

        # Pastikan NetSalesPKD numerik
        df['NetSalesPKD'] = pd.to_numeric(df['NetSalesPKD'], errors='coerce').fillna(0)

        # Hapus file lama cat_DEPO_* dan 25outlet_cat_DEPO_*
        deleted = 0
        for filename in os.listdir('.'):
            if (filename.startswith('cat_DEPO_') or filename.startswith('25outlet_cat_DEPO_')) and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file cat_DEPO / 25outlet_cat_DEPO lama dihapus")

        now_str = pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")

        # Kolom yang tersedia di sheet
        available = set(df.columns)

        # FILE 1: cat_DEPO — group by TYPE, tanpa SzCustId & Nama Pelanggan
        cat_grp_candidates = ['Nama Salesman','Tim','Periode','Periode1',
                              'szPrincipalGroupId','Principle','PwC_Grp3','TYPE']
        cat_grp = [c for c in cat_grp_candidates if c in available]

        # FILE 2: 25outlet_cat — group by SzCustId, tanpa TYPE
        outlet_grp_candidates = ['Nama Salesman','Tim','Periode','Periode1',
                                  'szPrincipalGroupId','Principle','PwC_Grp3','SzCustId']
        outlet_grp = [c for c in outlet_grp_candidates if c in available]

        # Mapping SzCustId → Nama Pelanggan (jika kolom ada)
        has_nama = 'Nama Pelanggan' in available and 'SzCustId' in available
        nama_map = {}
        if has_nama:
            nama_map = (df[['SzCustId','Nama Pelanggan']]
                        .dropna(subset=['SzCustId'])
                        .drop_duplicates('SzCustId')
                        .set_index('SzCustId')['Nama Pelanggan']
                        .to_dict())
            print(f"   Nama Pelanggan mapping: {len(nama_map)} entries")
        else:
            print("   ⚠️  Kolom 'Nama Pelanggan' tidak ditemukan, akan diisi kosong")

        cat_files    = []
        outlet_files = []

        for depo_name, depo_df in df.groupby('Depo'):
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')

            # ── FILE 1: cat_DEPO_xxx.json ─────────────────────────────────────
            cat_agg = (depo_df
                       .groupby(cat_grp, as_index=False, dropna=False)['NetSalesPKD']
                       .sum())
            cat_agg['NetSalesPKD'] = cat_agg['NetSalesPKD'].round(2)
            cat_agg = cat_agg.replace([np.nan, np.inf, -np.inf], None)
            cat_agg = cat_agg.where(pd.notnull(cat_agg), None)
            cat_records = cat_agg.to_dict('records')

            cat_json = {
                "metadata": {
                    "source": excel_file, "sheet_name": "OneSheetCat",
                    "depo": depo_name, "total_records": len(cat_records),
                    "columns": cat_grp + ['NetSalesPKD'],
                    "note": "Agregat level TYPE, tanpa SzCustId",
                    "last_updated": now_str
                },
                "data": cat_records
            }
            cat_file = f"cat_DEPO_{safe_name}.json"
            with open(cat_file, 'w', encoding='utf-8') as f:
                json.dump(cat_json, f, ensure_ascii=False, separators=(',',':'), allow_nan=False)
                f.flush(); os.fsync(f.fileno())
            os.utime(cat_file, (time.time(), time.time()))
            cat_files.append(cat_file)
            print(f"  ✅ {cat_file} — {len(cat_records)} records, {os.path.getsize(cat_file)/1024:.1f} KB")

            # ── FILE 2: 25outlet_cat_DEPO_xxx.json ────────────────────────────
            if not outlet_grp:
                print(f"  ⚠️  Kolom SzCustId tidak ada, skip 25outlet_cat untuk {depo_name}")
                continue

            outlet_agg = (depo_df
                          .groupby(outlet_grp, as_index=False, dropna=False)['NetSalesPKD']
                          .sum())
            outlet_agg['NetSalesPKD'] = outlet_agg['NetSalesPKD'].round(2)
            # Tambah Nama Pelanggan setelah SzCustId
            if 'SzCustId' in outlet_agg.columns:
                outlet_agg['Nama Pelanggan'] = outlet_agg['SzCustId'].map(nama_map).fillna('')
            else:
                outlet_agg['Nama Pelanggan'] = ''
            outlet_agg = outlet_agg.replace([np.nan, np.inf, -np.inf], None)
            outlet_agg = outlet_agg.where(pd.notnull(outlet_agg), None)
            outlet_records = outlet_agg.to_dict('records')

            outlet_json = {
                "metadata": {
                    "source": excel_file, "sheet_name": "OneSheetCat",
                    "depo": depo_name, "total_records": len(outlet_records),
                    "columns": outlet_grp + ['Nama Pelanggan', 'NetSalesPKD'],
                    "note": "Agregat level SzCustId, tanpa TYPE, semua periode",
                    "last_updated": now_str
                },
                "data": outlet_records
            }
            outlet_file = f"25outlet_cat_DEPO_{safe_name}.json"
            with open(outlet_file, 'w', encoding='utf-8') as f:
                json.dump(outlet_json, f, ensure_ascii=False, separators=(',',':'), allow_nan=False)
                f.flush(); os.fsync(f.fileno())
            os.utime(outlet_file, (time.time(), time.time()))
            outlet_files.append(outlet_file)
            print(f"  ✅ {outlet_file} — {len(outlet_records)} records, {os.path.getsize(outlet_file)/1024:.1f} KB")

        print(f"✅ {len(cat_files)} file cat_DEPO + {len(outlet_files)} file 25outlet_cat_DEPO dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export OneSheetCat: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_trend(excel_file, weekly_sheet="Trend By Week", daily_sheet="Trend By Day"):
    """Export sheet Trend ke trend_DEPO_<n>.json per Depo
    
    Struktur output:
    {
        "metadata": { "source", "depo", "weekly_records", "daily_records", "last_updated" },
        "weekly":   [ { "Depo", "Principle", "Bulan", "Week", "Week_Report" }, ... ],
        "daily":    [ { "Depo", "Date", "BP", "SO", "DO" }, ... ]
    }
    """
    try:
        # --- 1. Baca sheet Weekly ---
        print(f"📊 Membaca Sheet {weekly_sheet}...")
        df_weekly = pd.read_excel(excel_file, sheet_name=weekly_sheet, engine='pyxlsb', header=0)
        df_weekly.columns = df_weekly.columns.str.strip()
        df_weekly = df_weekly.replace([np.nan, np.inf, -np.inf], None)
        df_weekly = df_weekly.where(pd.notnull(df_weekly), None)

        if 'Depo' not in df_weekly.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan di sheet {weekly_sheet}")
            return False

        # Konversi kolom Bulan: serial Excel → string "MMM-YY" (misal "Mar-25")
        if 'Bulan' in df_weekly.columns:
            def convert_bulan(val):
                if val is None:
                    return None
                # Jika sudah berupa string (bukan serial), kembalikan apa adanya
                if isinstance(val, str):
                    return val
                if isinstance(val, (int, float)):
                    try:
                        return (pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(val))).strftime('%b-%y')
                    except:
                        return str(val)
                return str(val)
            df_weekly['Bulan'] = df_weekly['Bulan'].apply(convert_bulan)

        # Clean NaN in weekly records
        weekly_records_all = df_weekly.to_dict('records')
        for record in weekly_records_all:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        print(f"✅ {len(weekly_records_all)} baris weekly berhasil dibaca")

        # --- 2. Baca sheet Daily ---
        print(f"📊 Membaca Sheet {daily_sheet}...")
        df_daily = pd.read_excel(excel_file, sheet_name=daily_sheet, engine='pyxlsb', header=0)
        df_daily.columns = df_daily.columns.str.strip()
        df_daily = df_daily.replace([np.nan, np.inf, -np.inf], None)
        df_daily = df_daily.where(pd.notnull(df_daily), None)

        if 'Depo' not in df_daily.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan di sheet {daily_sheet}")
            return False

        # Konversi kolom Date: serial Excel → string MM/DD/YYYY
        if 'Date' in df_daily.columns:
            def convert_date(val):
                if val is None:
                    return None
                if isinstance(val, (int, float)):
                    try:
                        return (pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(val))).strftime('%m/%d/%Y')
                    except:
                        return str(val)
                return str(val)
            df_daily['Date'] = df_daily['Date'].apply(convert_date)

        # Clean NaN in daily records
        daily_records_all = df_daily.to_dict('records')
        for record in daily_records_all:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        print(f"✅ {len(daily_records_all)} baris daily berhasil dibaca")

        # --- 3. Hapus file trend_DEPO_*.json lama ---
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('trend_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file trend_DEPO lama dihapus")

        # --- 4. Groupby Depo → buat file per Depo ---
        weekly_by_depo = {}
        for record in weekly_records_all:
            depo = record.get('Depo')
            if not depo:
                continue
            weekly_by_depo.setdefault(depo, []).append(record)

        daily_by_depo = {}
        for record in daily_records_all:
            depo = record.get('Depo')
            if not depo:
                continue
            daily_by_depo.setdefault(depo, []).append(record)

        # Gabungkan semua Depo dari kedua sheet
        all_depos = sorted(set(list(weekly_by_depo.keys()) + list(daily_by_depo.keys())))

        if not all_depos:
            print("⚠️  Tidak ada data Depo ditemukan, tidak ada file yang dibuat")
            return False

        created_files = []

        for depo_name in all_depos:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            w_records = weekly_by_depo.get(depo_name, [])
            d_records = daily_by_depo.get(depo_name, [])

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "depo": depo_name,
                    "weekly_records": len(w_records),
                    "daily_records": len(d_records),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "weekly": w_records,
                "daily": d_records
            }

            # Generate filename: hapus prefix "Depo " jika ada
            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')
            filename = f"trend_DEPO_{safe_name}.json"

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} — weekly: {len(w_records)}, daily: {len(d_records)}")

        print(f"✅ {len(created_files)} file Trend per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export Trend: {str(e)}")
        import traceback
        traceback.print_exc()
        return False




def export_bp(excel_file):
    """Export sheet BP ke bp_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet BP...")
        df = pd.read_excel(excel_file, sheet_name="BP", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet BP kosong, tidak ada file yang dibuat")
            return False

        if 'Depo' not in df.columns:
            print("❌ Kolom 'Depo' tidak ditemukan di sheet BP")
            print(f"Available columns: {', '.join(df.columns)}")
            return False

        records_all = df.to_dict('records')
        for record in records_all:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        # Hapus file lama bp_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('bp_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file bp_DEPO lama dihapus")

        depo_groups = df.groupby('Depo')
        created_files = []
        total_bp_mtd = 0.0

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float):
                        if math.isnan(value) or math.isinf(value):
                            record[key] = None

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "BP",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(df.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')
            filename = f"bp_DEPO_{safe_name}.json"

            total_bp_mtd += sum((r.get('MTD') or 0) for r in depo_records)

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file BP per-Depo dibuat")
        return True, round(total_bp_mtd, 2)

    except Exception as e:
        print(f"⚠️  Gagal export BP: {str(e)}")
        import traceback
        traceback.print_exc()
        return False, 0.0


def export_outlet(excel_file):
    """Export sheet 25 Pareto Outlet ke outlet_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet 25 Pareto Outlet...")
        df = pd.read_excel(excel_file, sheet_name="25 Pareto Outlet", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet 25 Pareto Outlet kosong")
            return False

        if 'Depo' not in df.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan. Available: {', '.join(df.columns)}")
            return False

        # Hapus file lama
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('outlet_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file outlet_DEPO lama dihapus")

        depo_groups = df.groupby('Depo')
        created_files = []

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                        record[key] = None

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "25 Pareto Outlet",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(depo_data.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            filename = f"outlet_DEPO_{safe_name}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file outlet per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export outlet: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_sku(excel_file):
    """Export sheet 25 Pareto SKU ke sku_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet 25 Pareto SKU...")
        df = pd.read_excel(excel_file, sheet_name="25 Pareto SKU", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet 25 Pareto SKU kosong")
            return False

        if 'Depo' not in df.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan. Available: {', '.join(df.columns)}")
            return False

        # Hapus file lama
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('sku_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file sku_DEPO lama dihapus")

        depo_groups = df.groupby('Depo')
        created_files = []

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                        record[key] = None

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "25 Pareto SKU",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(depo_data.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            filename = f"sku_DEPO_{safe_name}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file SKU per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export SKU: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_proses(excel_file):
    """Export sheet Proses ke proses_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet Proses...")
        df = pd.read_excel(excel_file, sheet_name="Proses", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet Proses kosong, tidak ada file yang dibuat")
            return False

        if 'Depo' not in df.columns:
            print(f"❌ Kolom 'Depo' tidak ditemukan di sheet Proses")
            print(f"Available columns: {', '.join(df.columns)}")
            return False

        # Hapus file lama proses_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('proses_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file proses_DEPO lama dihapus")

        depo_groups = df.groupby('Depo')
        created_files = []

        for depo_name, depo_data in depo_groups:
            if not depo_name or (isinstance(depo_name, float) and math.isnan(depo_name)):
                continue

            depo_records = depo_data.to_dict('records')
            for record in depo_records:
                for key, value in record.items():
                    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
                        record[key] = None

            safe_name = str(depo_name).strip()
            if safe_name.upper().startswith('DEPO '):
                safe_name = safe_name[5:]
            safe_name = safe_name.upper().replace(' ', '_').replace('/', '_')

            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": "Proses",
                    "depo": depo_name,
                    "total_records": len(depo_records),
                    "columns": list(depo_data.columns),
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": depo_records
            }

            filename = f"proses_DEPO_{safe_name}.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file proses per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export Proses: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


def export_depo_list(excel_file):
    """Generate depo_list.json dari daftar depo di sheet OneSheet"""
    try:
        print("📋 Membuat depo_list.json...")
        df = pd.read_excel(excel_file, sheet_name="OneSheet", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()

        if 'Depo' not in df.columns:
            print("❌ Kolom 'Depo' tidak ditemukan di sheet OneSheet")
            return

        depo_list = []
        seen = set()
        for raw in df['Depo'].dropna().unique():
            name = str(raw).strip()
            if not name or name.upper() == 'NAN':
                continue
            # Normalisasi: hapus prefix "Depo ", uppercase, ganti spasi dengan _
            clean = name.upper()
            if clean.startswith('DEPO '):
                clean = clean[5:]
            clean = clean.replace(' ', '_').replace('/', '_')
            if clean and clean not in seen:
                seen.add(clean)
                depo_list.append(clean)

        depo_list.sort()

        import datetime
        output = {
            "depos": depo_list,
            "metadata": {
                "last_updated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total": len(depo_list)
            }
        }

        with open("depo_list.json", "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        print(f"✅ depo_list.json dibuat — {len(depo_list)} depo: {', '.join(depo_list)}")

    except Exception as e:
        print(f"❌ Gagal membuat depo_list.json: {e}")

if __name__ == "__main__":
    data_result = export_data()
    success, actual_mtd = data_result if isinstance(data_result, tuple) else (data_result, 0.0)
    if success:
        print()
        # Export project_DEPO_*.json dari sheet Project
        export_project("OneSheetDepo.xlsb")
        print()
        # Export bti_DEPO_*.json dari sheet BTI
        export_bti("OneSheetDepo.xlsb")
        print()
        # Export cat_DEPO_*.json dari sheet OneSheetCat
        export_onesheetcat("OneSheetDepo.xlsb")
        print()
        # Export bp_DEPO_*.json — harus sebelum TG agar MTD_BP tersedia
        _, bp_mtd = export_bp("OneSheetDepo.xlsb")
        print()
        # Export TG_DEPO_*.json — setelah data & bp agar summary MTD bisa disisipkan
        export_tg("OneSheetDepo.xlsb", actual_mtd=actual_mtd, bp_mtd=bp_mtd)
        print()
        # Export trend_DEPO_*.json dari sheet Trend By Week & Trend By Day
        export_trend("OneSheetDepo.xlsb")
        print()
        # Export outlet_DEPO_*.json dari sheet 25 Pareto Outlet
        export_outlet("OneSheetDepo.xlsb")
        print()
        # Export sku_DEPO_*.json dari sheet 25 Pareto SKU
        export_sku("OneSheetDepo.xlsb")
        print()
        # Export proses_DEPO_*.json dari sheet Proses
        export_proses("OneSheetDepo.xlsb")
        print()
        # Generate depo_list.json
        export_depo_list("OneSheetDepo.xlsb")
        print()
        print("🎉 Export berhasil!")
        print()
        print("💡 TIP: Jika date modified di Windows Explorer masih lama,")
        print("   tekan F5 untuk refresh folder atau cek dengan perintah:")
        print("   dir *.json")
    else:
        print()
        print("❌ Export gagal!")