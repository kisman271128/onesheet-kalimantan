import json
import pandas as pd
import sys
import os

def create_summary(excel_file, sheet_name=None):
    """
    Create summary JSON for Regional team from Excel data
    """
    try:
        print("=" * 60)
        print("  CREATE SUMMARY JSON FOR REGIONAL")
        print("=" * 60)
        print()
        
        print(f"📖 Membaca file Excel: {excel_file}")
        
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
        
        # Handle NaN values
        import numpy as np
        df = df.replace([np.nan, np.inf, -np.inf], None)
        
        # Check for required columns
        depo_col = None
        region_col = None
        
        for col in df.columns:
            if col.lower() in ['depo', 'depot', 'branch']:
                depo_col = col
            if col.lower() in ['region', 'regional', 'area']:
                region_col = col
        
        if not depo_col:
            print("❌ ERROR: Kolom 'Depo' tidak ditemukan!")
            return False
        
        print(f"📊 Analyzing data...")
        print()
        
        # Identify numeric columns for aggregation
        numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
        
        # Create summary by Depo
        summary_data = []
        
        if region_col:
            depo_groups = df.groupby([region_col, depo_col])
        else:
            depo_groups = df.groupby(depo_col)
        
        for group_key, group_data in depo_groups:
            if isinstance(group_key, tuple):
                region, depo = group_key
            else:
                region = "N/A"
                depo = group_key
            
            # Skip if depo is None
            if not depo or pd.isna(depo):
                continue
            
            summary_record = {
                "region": region if region and not pd.isna(region) else "N/A",
                "depo": depo,
                "total_records": len(group_data)
            }
            
            # Aggregate numeric columns
            for col in numeric_cols:
                col_data = group_data[col].dropna()
                if len(col_data) > 0:
                    summary_record[f"{col}_sum"] = float(col_data.sum())
                    summary_record[f"{col}_avg"] = float(col_data.mean())
                    summary_record[f"{col}_min"] = float(col_data.min())
                    summary_record[f"{col}_max"] = float(col_data.max())
            
            summary_data.append(summary_record)
        
        # Create overall summary
        overall_summary = {
            "total_depos": len(summary_data),
            "total_records": len(df),
            "depo_list": sorted([str(item['depo']) for item in summary_data])
        }
        
        if region_col:
            regions = df[region_col].dropna().unique().tolist()
            overall_summary["regions"] = sorted([str(r) for r in regions if r])
            overall_summary["total_regions"] = len(overall_summary["regions"])
        
        # Create JSON structure
        json_data = {
            "metadata": {
                "source": excel_file,
                "sheet_name": sheet_name if sheet_name else "Sheet pertama",
                "type": "summary",
                "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")
            },
            "overall": overall_summary,
            "summary_by_depo": summary_data
        }
        
        # Write JSON file
        filename = "data_SUMMARY.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2, allow_nan=False)
        
        print("=" * 60)
        print(f"✅ SELESAI! {filename} dibuat")
        print("=" * 60)
        print()
        print(f"📊 Summary Statistics:")
        print(f"   Total Depos: {overall_summary['total_depos']}")
        print(f"   Total Records: {overall_summary['total_records']}")
        if region_col:
            print(f"   Total Regions: {overall_summary['total_regions']}")
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
    
    # Check if custom parameters provided
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    if len(sys.argv) > 2:
        sheet_name = sys.argv[2]
    
    # Check if Excel file exists
    if not os.path.exists(excel_file):
        print(f"❌ File Excel tidak ditemukan: {excel_file}")
        sys.exit(1)
    
    # Create summary
    success = create_summary(excel_file, sheet_name)
    
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
