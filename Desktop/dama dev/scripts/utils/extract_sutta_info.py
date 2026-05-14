import os
import json
import re

def extract_sutta_info():
    base_dir = r'C:\Users\ADMIN\Desktop\mob app\data\validated-json'
    output_file = r'C:\Users\ADMIN\Desktop\mob app\docs\sutta_neat_list.txt'

    results = []

    for root, dirs, files in os.walk(base_dir):
        # Determine Nikaya from path
        nikaya = ""
        path_parts = root.lower().split(os.sep)
        if 'an' in path_parts:
            nikaya = "AN"
        elif 'sn' in path_parts:
            nikaya = "SN"

        for file in files:
            if file.endswith('.json') and file != 'index.json':
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        # Use strict=False to allow control characters in strings
                        data = json.loads(content, strict=False)

                        sutta_id = data.get('sutta_id', 'N/A')
                        # Normalize sutta_id to include Nikaya if missing
                        if sutta_id != 'N/A' and not any(sutta_id.startswith(p) for p in ["AN", "SN", "DN", "MN"]):
                            if nikaya:
                                sutta_id = f"{nikaya} {sutta_id}"

                        sutta_name = data.get('sutta_name_en', 'N/A')

                        # Chain
                        chain_items = data.get('chain', {}).get('items', [])
                        chain_str = " -> ".join(chain_items) if chain_items else "N/A"

                        # Links
                        links = []
                        if data.get('youtube_url'):
                            links.append(data['youtube_url'])
                        if data.get('aud_file'):
                            links.append(data['aud_file'])

                        link_str = " | ".join(links) if links else "N/A"

                        results.append({
                            'id': sutta_id,
                            'name': sutta_name,
                            'chain': chain_str,
                            'links': link_str
                        })
                except Exception as e:
                    print(f"Error reading {file_path}: {e}")

    # Custom sort function for Sutta IDs
    def sutta_key(item):
        s_id = item['id']
        # Try to extract numbers for better sorting (e.g., AN 1.19 before AN 10.1)
        match = re.match(r'([A-Z]+)\s*(\d+)\.?(\d+)?\.?(\d+)?', s_id)
        if match:
            nikaya = match.group(1)
            n1 = int(match.group(2)) if match.group(2) else 0
            n2 = int(match.group(3)) if match.group(3) else 0
            n3 = int(match.group(4)) if match.group(4) else 0
            return (nikaya, n1, n2, n3)
        return (s_id,)

    results.sort(key=sutta_key)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("SUTTA NEAT LIST\n")
        f.write("=" * 180 + "\n")
        f.write(f"{'ID':<15} | {'Name':<50} | {'Chain':<30} | {'Links'}\n")
        f.write("-" * 180 + "\n")
        for item in results:
            name = item['name']
            if len(name) > 47:
                name = name[:47] + "..."
            chain = item['chain']
            if len(chain) > 27:
                chain = chain[:27] + "..."
            f.write(f"{item['id']:<15} | {name:<50} | {chain:<30} | {item['links']}\n")

    print(f"Successfully extracted info for {len(results)} suttas to {output_file}")

if __name__ == "__main__":
    extract_sutta_info()
