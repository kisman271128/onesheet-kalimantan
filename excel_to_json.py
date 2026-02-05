import json
import pandas as pd
import sys
import os

def excel_to_json(excel_file, json_file, sheet_name=None):
    """
    Convert Excel file to JSON format
    """
    try:
        print(f"📖 Membaca file Excel: {excel_file}")
        
        if sheet_name:
            print(f"📄 Sheet yang akan dibaca: {sheet_name}")
        
        # Read Excel file - xlsb format requires pyxlsb
        # Trying different engines
        try:
            df = pd.read_excel(excel_file, sheet_name=sheet_name, engine='pyxlsb')
        except:
            try:
                df = pd.read_excel(excel_file, sheet_name=sheet_name, engine='openpyxl')
            except:
                df = pd.read_excel(excel_file, sheet_name=sheet_name)
        
        print(f"✅ File Excel berhasil dibaca: {len(df)} baris")
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        # Replace NaN with None for better JSON handling
        df = df.where(pd.notnull(df), None)
        
        # Convert DataFrame to list of dictionaries
        data_list = df.to_dict('records')
        
        # Create JSON structure
        json_data = {
            "metadata": {
                "source": excel_file,
                "sheet_name": sheet_name if sheet_name else "Sheet pertama",
                "total_records": len(data_list),
                "columns": list(df.columns),
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "data": data_list
        }
        
        # Write to JSON file
        print(f"💾 Menyimpan ke JSON: {json_file}")
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Konversi berhasil! {len(data_list)} records disimpan")
        print(f"📁 File JSON: {json_file}")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    # Default file names
    excel_file = "Dsource OneSheet Kalimantan.xlsb"
    json_file = "data.json"
    sheet_name = None
    
    # Check if custom file names provided
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    if len(sys.argv) > 2:
        json_file = sys.argv[2]
    if len(sys.argv) > 3:
        sheet_name = sys.argv[3]
    
    # Check if Excel file exists
    if not os.path.exists(excel_file):
        print(f"❌ File Excel tidak ditemukan: {excel_file}")
        sys.exit(1)
    
    # Convert
    success = excel_to_json(excel_file, json_file, sheet_name)
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
