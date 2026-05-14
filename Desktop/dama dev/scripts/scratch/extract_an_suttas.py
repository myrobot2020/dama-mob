import json
import os

def extract_an_suttas():
    input_file = 'data/validated-json/index.json'
    output_file = 'an_sutta_names.txt'
    base_dir = 'data/validated-json'

    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            data = json.load(f)

        an_items = [item for item in data.get('items', []) if item.get('nikaya') == 'AN']
        results = []

        for item in an_items:
            sutta_id = item.get('suttaid')
            title = item.get('title')

            # Attempt to find the detail JSON file for more info
            # Format: AN 1.18.13 -> an/an1/1.18.13.json
            detail_data = {}
            if sutta_id and sutta_id.startswith('AN '):
                parts = sutta_id.split(' ')
                if len(parts) >= 2:
                    sub_parts = parts[1].split('.')
                    book_num = sub_parts[0]
                    file_id = parts[1]
                    detail_path = os.path.join(base_dir, 'an', f'an{book_num}', f'{file_id}.json')

                    if os.path.exists(detail_path):
                        try:
                            with open(detail_path, 'r', encoding='utf-8') as df:
                                detail_data = json.load(df)
                        except:
                            pass

            # Extract chain
            chain_items = detail_data.get('chain', {}).get('items', [])
            chain_str = " -> ".join(chain_items) if chain_items else "N/A"

            # Extract links
            links = []
            if detail_data.get('youtube_url'):
                links.append(detail_data['youtube_url'])
            if detail_data.get('aud_file'):
                links.append(detail_data['aud_file'])
            link_str = " | ".join(links) if links else "N/A"

            results.append(f"{sutta_id} | {title} | Chain: {chain_str} | Links: {link_str}")

        with open(output_file, 'w', encoding='utf-8') as f:
            for line in results:
                f.write(line + '\n')

        print(f"Successfully extracted {len(results)} AN suttas with chains/links to {output_file}")
        return results
    except Exception as e:
        print(f"An error occurred: {e}")
        return []

if __name__ == "__main__":
    extract_an_suttas()
