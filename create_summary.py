import json
import pandas as pd
import sys
import os

def create_summary(excel_file, sheet_name=None):
    """
    Create summary JSON for Regional dashboard
    Aggregates by Depo, Nama Salesman, Tipe Sales, Channel, Clas
    Uses different aggregation methods: COUNT DISTINCT, SUM, AVERAGE
    """
    try:
        print("=" * 60)
        print("  CREATE SUMMARY JSON FOR REGIONAL DASHBOARD")
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
        
        print(f"✅ File berhasil dibaca: {len(df)} baris, {len(df.columns)} kolom")
        print()
        
        # Clean column names
        df.columns = df.columns.str.strip()
        
        # Check for required columns
        required_cols = ['Depo', 'Channel', 'Clas']
        missing_cols = [col for col in required_cols if col not in df.columns]
        
        if missing_cols:
            print(f"❌ ERROR: Kolom berikut tidak ditemukan: {missing_cols}")
            return False
        
        # Check for Nama Salesman (with variations)
        nama_salesman_col = None
        for col in df.columns:
            if col.lower() in ['nama salesman', 'salesman', 'nama_salesman']:
                nama_salesman_col = col
                break
        
        if not nama_salesman_col:
            print("❌ ERROR: Kolom 'Nama Salesman' tidak ditemukan!")
            return False
        
        # Check for Tipe Sales (with variations)
        tipe_sales_col = None
        for col in df.columns:
            if col.lower() in ['tipe sales', 'tipe_sales', 'tipesales', 'tipe']:
                tipe_sales_col = col
                break
        
        if not tipe_sales_col:
            print("❌ ERROR: Kolom 'Tipe Sales' tidak ditemukan!")
            return False
        
        # Check for Id Pelanggan (for CR count)
        id_pelanggan_col = None
        for col in df.columns:
            if col.lower() in ['id pelanggan', 'id_pelanggan', 'idpelanggan', 'customer id']:
                id_pelanggan_col = col
                break
        
        if not id_pelanggan_col:
            print("⚠️  WARNING: Kolom 'Id Pelanggan' tidak ditemukan! CR akan di-set 0")
        
        print(f"✅ Found required columns:")
        print(f"   - Depo: Depo")
        print(f"   - Salesman: {nama_salesman_col}")
        print(f"   - Tipe Sales: {tipe_sales_col}")
        if id_pelanggan_col:
            print(f"   - Id Pelanggan: {id_pelanggan_col}")
        print()
        
        # Find ET column index
        et_col_idx = None
        for idx, col in enumerate(df.columns):
            if col.strip().upper() == 'ET':
                et_col_idx = idx
                break
        
        if et_col_idx is None:
            print("❌ ERROR: Kolom 'ET' tidak ditemukan!")
            return False
        
        print(f"📊 Found ET column at index {et_col_idx}")
        
        # Rename columns to standard names
        df = df.rename(columns={
            nama_salesman_col: 'Nama Salesman',
            tipe_sales_col: 'Tipe Sales'
        })
        if id_pelanggan_col:
            df = df.rename(columns={id_pelanggan_col: 'Id Pelanggan'})
        
        # Get columns from ET onwards
        agg_columns = df.columns[et_col_idx:].tolist()
        print(f"Columns from ET onwards: {len(agg_columns)} columns")
        print()
        
        # Clean data
        import numpy as np
        df = df.replace([np.nan, np.inf, -np.inf], None)
        
        # Convert numeric columns
        for col in agg_columns:
            if col in df.columns:
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                except:
                    pass
        
        print(f"🔄 Aggregating data by Depo, Nama Salesman, Tipe Sales, Channel, Clas...")
        print()
        
        # Define aggregation methods for each column
        # AVERAGE columns
        avg_columns = ['ET', 'MTDET']
        
        # COUNT DISTINCT columns (will handle separately)
        # CR = count distinct Id Pelanggan
        
        # All others = SUM
        
        # Group by
        group_cols = ['Depo', 'Nama Salesman', 'Tipe Sales', 'Channel', 'Clas']
        
        # Create aggregation dictionary
        agg_dict = {}
        
        # For each column from ET onwards
        for col in agg_columns:
            if col in avg_columns:
                agg_dict[col] = 'mean'  # Average
            else:
                agg_dict[col] = 'sum'   # Sum
        
        # Perform aggregation
        grouped = df.groupby(group_cols, as_index=False).agg(agg_dict)
        
        # Add CR column (count distinct Id Pelanggan)
        if id_pelanggan_col and 'Id Pelanggan' in df.columns:
            cr_counts = df.groupby(group_cols)['Id Pelanggan'].nunique().reset_index()
            cr_counts = cr_counts.rename(columns={'Id Pelanggan': 'CR'})
            
            # Merge CR into grouped data
            grouped = grouped.merge(cr_counts, on=group_cols, how='left')
            
            # Move CR to position after Clas
            cols = grouped.columns.tolist()
            cols.remove('CR')
            clas_idx = cols.index('Clas')
            cols.insert(clas_idx + 1, 'CR')
            grouped = grouped[cols]
        else:
            # Insert CR column with 0 after Clas
            grouped.insert(5, 'CR', 0)
        
        # Convert to list of dictionaries
        summary_data = grouped.to_dict('records')
        
        # Clean up the data
        for record in summary_data:
            for key, value in record.items():
                if pd.isna(value):
                    record[key] = 0
                elif isinstance(value, (np.integer, np.floating)):
                    record[key] = float(value) if not np.isnan(value) else 0
                elif isinstance(value, str):
                    record[key] = value.strip()
        
        # Create metadata
        metadata = {
            "source": excel_file,
            "sheet_name": sheet_name if sheet_name else "Sheet pertama",
            "type": "summary_regional",
            "last_updated": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_records": len(summary_data),
            "aggregated_by": group_cols,
            "aggregation_methods": {
                "CR": "COUNT DISTINCT (Id Pelanggan)",
                "ET": "AVERAGE",
                "MTDET": "AVERAGE",
                "Others": "SUM"
            }
        }
        
        # Get unique values
        depos = sorted(grouped['Depo'].dropna().unique().tolist())
        channels = sorted(grouped['Channel'].dropna().unique().tolist())
        classes = sorted(grouped['Clas'].dropna().unique().tolist())
        tipe_sales = sorted(grouped['Tipe Sales'].dropna().unique().tolist())
        
        metadata["unique_depos"] = [str(d) for d in depos]
        metadata["unique_channels"] = [str(c) for c in channels]
        metadata["unique_classes"] = [str(c) for c in classes]
        metadata["unique_tipe_sales"] = [str(t) for t in tipe_sales]
        
        # Create JSON structure
        json_data = {
            "metadata": metadata,
            "data": summary_data
        }
        
        # Write JSON file
        filename = "data_SUMMARY.json"
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        
        print("=" * 60)
        print(f"✅ SELESAI! {filename} dibuat")
        print("=" * 60)
        print()
        print(f"📊 Summary Statistics:")
        print(f"   Total Records: {len(summary_data)}")
        print(f"   Unique Depos: {len(depos)}")
        print(f"   Unique Channels: {len(channels)}")
        print(f"   Unique Classes: {len(classes)}")
        print(f"   Unique Tipe Sales: {len(tipe_sales)}")
        print()
        print(f"📋 Depos: {', '.join(depos)}")
        print(f"📋 Channels: {', '.join(channels)}")
        print(f"📋 Classes: {', '.join(classes)}")
        print(f"📋 Tipe Sales: {', '.join(tipe_sales)}")
        print()
        print(f"📁 Aggregation Methods:")
        print(f"   - CR: COUNT DISTINCT Id Pelanggan")
        print(f"   - ET, MTDET: AVERAGE")
        print(f"   - All others: SUM")
        print()
        print(f"📁 Sample record:")
        if summary_data:
            sample = {k: summary_data[0][k] for k in list(summary_data[0].keys())[:15]}
            print(json.dumps(sample, indent=2, ensure_ascii=False))
            print("   ...")
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
        print("🎉 Summary regional berhasil dibuat!")
        sys.exit(0)
    else:
        print("❌ Gagal membuat summary regional")
        sys.exit(1)
