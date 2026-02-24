import json
import pandas as pd
import numpy as np
import os
import math
import time

def export_tg(excel_file, df_tg=None):
    """Export sheet TG ke TG.json"""
    try:
        print("📊 Membaca Sheet TG...")
        df = pd.read_excel(excel_file, sheet_name="TG", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet TG kosong, TG.json tidak dibuat")
            return False

        # Ambil baris pertama data
        row = df.iloc[0]

        total_hk   = row.get('Total HK')
        hk_berjalan= row.get('HK Berjalan')
        sisa_hk    = row.get('Sisa HK')
        tg_raw     = row.get('TG')
        day_closing= row.get('Day Closing')

        # Konversi Day Closing: bisa berupa angka serial Excel atau string
        if isinstance(day_closing, (int, float)) and day_closing is not None:
            try:
                day_closing_str = (pd.Timestamp('1899-12-30') + pd.Timedelta(days=int(day_closing))).strftime('%m/%d/%Y')
            except:
                day_closing_str = str(day_closing)
        else:
            day_closing_str = str(day_closing) if day_closing is not None else 'N/A'

        # Hitung TG_Percentage
        if tg_raw is not None:
            if 0 <= float(tg_raw) <= 1:
                tg_pct = round(float(tg_raw) * 100, 2)
            else:
                tg_pct = round(float(tg_raw), 2)
        elif total_hk and hk_berjalan:
            tg_pct = round(float(hk_berjalan) / float(total_hk) * 100, 2)
        else:
            tg_pct = 0.0

        tg_json = {
            "metadata": {
                "source": excel_file,
                "sheet_name": "TG",
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "data": {
                "Total HK":      int(total_hk)    if total_hk    is not None else None,
                "HK Berjalan":   int(hk_berjalan) if hk_berjalan is not None else None,
                "Sisa HK":       int(sisa_hk)     if sisa_hk     is not None else None,
                "TG":            float(tg_raw)    if tg_raw      is not None else None,
                "Day Closing":   day_closing_str,
                "TG_Percentage": tg_pct
            }
        }

        with open('TG.json', 'w', encoding='utf-8') as f:
            json.dump(tg_json, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())

        current_time = time.time()
        os.utime('TG.json', (current_time, current_time))

        print(f"✅ TG.json dibuat — TG: {tg_pct}% | Day Closing: {day_closing_str}")
        return True

    except Exception as e:
        print(f"⚠️  Gagal membuat TG.json: {str(e)}")
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
                (filename.startswith('data_'))   or
                (filename.startswith('bti_'))    or
                (filename.startswith('project_')) or
                (filename.startswith('cat_'))
            )
            if should_delete:
                try:
                    os.remove(filename)
                    deleted_count += 1
                except:
                    pass
        for fixed_file in ['depo_list.json', 'TG.json']:
            if os.path.exists(fixed_file):
                try:
                    os.remove(fixed_file)
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
        
        # Create depo list
        depo_list = {
            "depos": sorted([str(name) for name in depo_groups.groups.keys()]),
            "total_depos": len(depo_groups),
            "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        with open('depo_list.json', 'w', encoding='utf-8') as f:
            json.dump(depo_list, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        # Explicitly set modification time to NOW
        current_time = time.time()
        os.utime('depo_list.json', (current_time, current_time))
        
        print("📋 Created depo_list.json")
        print()
        print("Files created:")
        for f in created_files:
            print(f"  - {f}")
        
        return True

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

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

        # --- 1. Export flat Project.json ---
        project_json = {
            "metadata": {
                "source": excel_file,
                "sheet_name": "Project",
                "total_records": len(records),
                "columns": list(df.columns),
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "data": records
        }

        with open('Project.json', 'w', encoding='utf-8') as f:
            json.dump(project_json, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())

        current_time = time.time()
        os.utime('Project.json', (current_time, current_time))
        print(f"✅ Project.json dibuat — {len(records)} records")

        # --- 2. Split per Depo → project_DEPO_<name>.json ---
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

        # --- 1. Export flat BTI.json ---
        bti_json = {
            "metadata": {
                "source": excel_file,
                "sheet_name": "BTI",
                "total_records": len(records),
                "columns": list(df.columns),
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "data": records
        }

        with open('BTI.json', 'w', encoding='utf-8') as f:
            json.dump(bti_json, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())

        current_time = time.time()
        os.utime('BTI.json', (current_time, current_time))
        print(f"✅ BTI.json dibuat — {len(records)} records")

        # --- 2. Split per Depo berdasarkan kolom szWorkplaceName ---
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
    """Export sheet OneSheetCat ke OnesheetCat.json (flat) dan cat_DEPO_<n>.json per Depo"""
    try:
        print("📊 Membaca Sheet OneSheetCat...")
        df = pd.read_excel(excel_file, sheet_name="OneSheetCat", engine='pyxlsb', header=0)
        df.columns = df.columns.str.strip()
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)

        if df.empty:
            print("⚠️  Sheet OneSheetCat kosong, tidak ada file yang dibuat")
            return False

        # Clean NaN in records
        records = df.to_dict('records')
        for record in records:
            for key, value in record.items():
                if isinstance(value, float):
                    if math.isnan(value) or math.isinf(value):
                        record[key] = None

        # --- 1. Export flat OnesheetCat.json ---
        cat_json = {
            "metadata": {
                "source": excel_file,
                "sheet_name": "OneSheetCat",
                "total_records": len(records),
                "columns": list(df.columns),
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "data": records
        }

        with open('OnesheetCat.json', 'w', encoding='utf-8') as f:
            json.dump(cat_json, f, ensure_ascii=False, indent=2, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())

        current_time = time.time()
        os.utime('OnesheetCat.json', (current_time, current_time))
        print(f"✅ OnesheetCat.json dibuat — {len(records)} records")

        # --- 2. Split per Depo ---
        if 'Depo' not in df.columns:
            print("⚠️  Kolom 'Depo' tidak ditemukan, skip split per Depo")
            return True

        # Hapus file lama cat_DEPO_*.json
        deleted = 0
        for filename in os.listdir('.'):
            if filename.startswith('cat_DEPO_') and filename.endswith('.json'):
                try:
                    os.remove(filename)
                    deleted += 1
                except:
                    pass
        if deleted:
            print(f"🗑️  {deleted} file cat_DEPO lama dihapus")

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
                    "sheet_name": "OneSheetCat",
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
            filename = f"cat_DEPO_{safe_name}.json"

            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
                f.flush()
                os.fsync(f.fileno())

            current_time = time.time()
            os.utime(filename, (current_time, current_time))
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(depo_records)} records")

        print(f"✅ {len(created_files)} file OneSheetCat per-Depo dibuat")
        return True

    except Exception as e:
        print(f"⚠️  Gagal export OneSheetCat: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = export_data()
    if success:
        print()
        # Export TG.json dari sheet TG
        export_tg("OneSheetDepo.xlsb")
        print()
        # Export Project.json dari sheet Project
        export_project("OneSheetDepo.xlsb")
        print()
        # Export BTI.json dari sheet BTI
        export_bti("OneSheetDepo.xlsb")
        print()
        # Export OnesheetCat.json dan cat_DEPO_*.json dari sheet OneSheetCat
        export_onesheetcat("OneSheetDepo.xlsb")
        print()
        print("🎉 Export berhasil!")
        print()
        print("💡 TIP: Jika date modified di Windows Explorer masih lama,")
        print("   tekan F5 untuk refresh folder atau cek dengan perintah:")
        print("   dir *.json")
    else:
        print()
        print("❌ Export gagal!")