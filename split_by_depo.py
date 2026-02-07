import json
import pandas as pd
import sys
import os
from collections import defaultdict

def split_by_depo(excel_file, sheet_name=None):
    """
    Auto-split Excel data by Depo column and create individual JSON files
    """
    try:
        print("=" * 60)
        print("  AUTO-SPLIT JSON BY DEPO")
        print("=" * 60)
        print()
        
        print(f"📖 Membaca file Excel: {excel_file}")
        
        if sheet_name:
            print(f"📄 Sheet: {sheet_name}")
        
        # Read Excel file
        try:
            df = pd.read_excel(excel_file, sheet_name=sheet_name, engine='pyxlsb')
        except:
            try:
                df = pd.read_excel(excel_file, sheet_name=sheet_name, engine='openpyxl')
            except:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
        
        print(f"✅ File berhasil dibaca: {len(df)} baris")
        print()
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        # Check if 'Depo' column exists
        depo_col = None
        for col in df.columns:
            if col.lower() in ['depo', 'depot', 'branch']:
                depo_col = col
                break
        
        if not depo_col:
            print("❌ ERROR: Kolom 'Depo' tidak ditemukan!")
            print(f"Available columns: {', '.join(df.columns)}")
            return False
        
        print(f"📊 Menggunakan kolom: '{depo_col}'")
        print()
        
        # Handle NaN values
        import numpy as np
        import math
        df = df.replace([np.nan, np.inf, -np.inf], None)
        df = df.where(pd.notnull(df), None)
        
        # Group by Depo
        depo_groups = df.groupby(depo_col)
        
        print(f"🏢 Ditemukan {len(depo_groups)} Depo:")
        
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
                    "sheet_name": sheet_name if sheet_name else "Sheet pertama",
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
            
            # Write JSON file
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
            
            created_files.append(filename)
            print(f"  ✅ {filename} - {len(records)} records")
        
        print()
        print("=" * 60)
        print(f"✅ SELESAI! {len(created_files)} file JSON dibuat")
        print("=" * 60)
        print()
        
        # Create file list
        with open('depo_list.json', 'w', encoding='utf-8') as f:
            depo_list = {
                "depos": sorted(list(depo_groups.groups.keys())),
                "total_depos": len(depo_groups),
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            json.dump(depo_list, f, ensure_ascii=False, indent=2)
        
        print("📋 Created depo_list.json - List of all Depos")
        print()
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Default file names
    excel_file = "Dsource OneSheet Kalimantan.xlsb"
    sheet_name = "JKS & BE"
    tg_sheet = "TG"
    
    # Check if custom parameters provided
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    if len(sys.argv) > 2:
        sheet_name = sys.argv[2]
    
    # Check if Excel file exists
    if not os.path.exists(excel_file):
        print(f"❌ File Excel tidak ditemukan: {excel_file}")
        sys.exit(1)
    
    # Split by Depo
    success = split_by_depo(excel_file, sheet_name)
    
    # Export TG sheet
    if success:
        print()
        print("=" * 60)
        print("  EXPORTING TG DATA")
        print("=" * 60)
        print()
        
        try:
            # Read TG sheet
            try:
                tg_df = pd.read_excel(excel_file, sheet_name=tg_sheet, engine='pyxlsb')
            except:
                try:
                    tg_df = pd.read_excel(excel_file, sheet_name=tg_sheet, engine='openpyxl')
                except:
                    tg_df = pd.read_excel(excel_file, sheet_name=tg_sheet)
            
            print(f"✅ TG sheet berhasil dibaca: {len(tg_df)} baris")
            
            # Clean column names
            tg_df.columns = tg_df.columns.str.strip()
            
            # Get first row data (only 1 row expected)
            if len(tg_df) > 0:
                tg_row = tg_df.iloc[0]
                
                # Extract required columns
                tg_data = {
                    "Total_HK": int(tg_row.get('Total HK', 0)) if pd.notna(tg_row.get('Total HK')) else 0,
                    "HK_Berjalan": int(tg_row.get('HK Berjalan', 0)) if pd.notna(tg_row.get('HK Berjalan')) else 0,
                    "Sisa_HK": int(tg_row.get('Sisa HK', 0)) if pd.notna(tg_row.get('Sisa HK')) else 0,
                    "TG": float(tg_row.get('TG', 0)) if pd.notna(tg_row.get('TG')) else 0,
                    "Day_Closing": str(tg_row.get('Day Closing', '')) if pd.notna(tg_row.get('Day Closing')) else ''
                }
                
                # Convert Day Closing to readable format if it's a timestamp
                try:
                    if isinstance(tg_row.get('Day Closing'), pd.Timestamp):
                        tg_data["Day_Closing"] = tg_row.get('Day Closing').strftime("%d/%m/%Y")
                    elif pd.notna(tg_row.get('Day Closing')):
                        # Try to parse as date
                        day_closing = pd.to_datetime(tg_row.get('Day Closing'))
                        tg_data["Day_Closing"] = day_closing.strftime("%d/%m/%Y")
                except:
                    # Keep as string if parsing fails
                    pass
                
                # Create TG JSON
                tg_json = {
                    "metadata": {
                        "source": excel_file,
                        "sheet_name": tg_sheet,
                        "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                    },
                    "data": tg_data
                }
                
                # Write TG.json
                with open('TG.json', 'w', encoding='utf-8') as f:
                    json.dump(tg_json, f, ensure_ascii=False, indent=2)
                
                print(f"✅ TG.json created successfully")
                print(f"   Total HK: {tg_data['Total_HK']}")
                print(f"   HK Berjalan: {tg_data['HK_Berjalan']}")
                print(f"   Sisa HK: {tg_data['Sisa_HK']}")
                print(f"   TG: {tg_data['TG']}")
                print(f"   Day Closing: {tg_data['Day_Closing']}")
                print()
            else:
                print("⚠️  WARNING: TG sheet is empty")
        
        except Exception as e:
            print(f"⚠️  WARNING: Could not export TG sheet: {str(e)}")
            print("   Continuing without TG.json...")
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
