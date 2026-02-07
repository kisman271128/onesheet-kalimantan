import json
import pandas as pd
import sys
import os
from datetime import datetime

def export_tg(excel_file, sheet_name="TG"):
    """
    Export TG sheet to TG.json with specific columns
    """
    try:
        print("=" * 60)
        print("  EXPORT TG SHEET TO JSON")
        print("=" * 60)
        print()
        
        print(f"📖 Membaca file Excel: {excel_file}")
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
        
        # Expected columns
        expected_cols = ['Total HK', 'HK Berjalan', 'Sisa HK', 'TG', 'Day Closing']
        
        # Check if expected columns exist
        missing_cols = []
        for col in expected_cols:
            if col not in df.columns:
                missing_cols.append(col)
        
        if missing_cols:
            print(f"⚠️  WARNING: Kolom berikut tidak ditemukan: {missing_cols}")
            print(f"Available columns: {list(df.columns)}")
        
        # Get first row (assuming TG data is in first row)
        if len(df) > 0:
            first_row = df.iloc[0]
            
            # Extract data
            tg_data = {}
            for col in expected_cols:
                if col in df.columns:
                    value = first_row[col]
                    
                    # Handle different data types
                    if col == 'Day Closing':
                        # Convert date to string
                        if pd.notna(value):
                            if isinstance(value, (pd.Timestamp, datetime)):
                                tg_data[col] = value.strftime("%d/%m/%Y")
                            else:
                                tg_data[col] = str(value)
                        else:
                            tg_data[col] = None
                    else:
                        # Numeric values
                        if pd.notna(value):
                            tg_data[col] = float(value)
                        else:
                            tg_data[col] = 0
                else:
                    tg_data[col] = None
            
            # Calculate TG percentage if not present
            if 'TG' in tg_data and tg_data['TG'] is not None:
                # If TG is decimal (0.173913), convert to percentage
                if 0 <= tg_data['TG'] <= 1:
                    tg_data['TG_Percentage'] = round(tg_data['TG'] * 100, 1)
                else:
                    tg_data['TG_Percentage'] = round(tg_data['TG'], 1)
            else:
                tg_data['TG_Percentage'] = 0
            
            # Create JSON structure
            json_data = {
                "metadata": {
                    "source": excel_file,
                    "sheet_name": sheet_name,
                    "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
                },
                "data": tg_data
            }
            
            # Write JSON file
            filename = "TG.json"
            with open(filename, 'w', encoding='utf-8') as f:
                json.dump(json_data, f, ensure_ascii=False, indent=2)
            
            print("=" * 60)
            print(f"✅ SELESAI! {filename} dibuat")
            print("=" * 60)
            print()
            print("📊 TG Data:")
            print(f"   Total HK: {tg_data.get('Total HK', 0)}")
            print(f"   HK Berjalan: {tg_data.get('HK Berjalan', 0)}")
            print(f"   Sisa HK: {tg_data.get('Sisa HK', 0)}")
            print(f"   TG: {tg_data.get('TG', 0)} ({tg_data.get('TG_Percentage', 0)}%)")
            print(f"   Day Closing: {tg_data.get('Day Closing', 'N/A')}")
            print()
            
            return True
        else:
            print("❌ ERROR: Sheet TG kosong!")
            return False
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    # Default file name
    excel_file = "Dsource OneSheet Kalimantan.xlsb"
    sheet_name = "TG"
    
    # Check if custom parameters provided
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    if len(sys.argv) > 2:
        sheet_name = sys.argv[2]
    
    # Check if Excel file exists
    if not os.path.exists(excel_file):
        print(f"❌ File Excel tidak ditemukan: {excel_file}")
        sys.exit(1)
    
    # Export TG
    success = export_tg(excel_file, sheet_name)
    
    if success:
        print("🎉 TG.json berhasil dibuat!")
        sys.exit(0)
    else:
        print("❌ Gagal membuat TG.json")
        sys.exit(1)
