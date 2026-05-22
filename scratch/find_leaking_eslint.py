import os
import re

def scan_files():
    pattern = re.compile(r'^\s*//\s*eslint-disable-next-line')
    results = []
    
    src_dir = r"E:\SarayaERP\client\src"
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            if file.endswith('.tsx'):
                filepath = os.path.join(root, file)
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        lines = f.readlines()
                    for idx, line in enumerate(lines):
                        if pattern.match(line):
                            start = max(0, idx - 4)
                            end = min(len(lines), idx + 5)
                            context = lines[start:end]
                            results.append({
                                'file': filepath,
                                'line_num': idx + 1,
                                'line_content': line.strip(),
                                'context': context,
                                'context_start': start + 1
                            })
                except Exception as e:
                    print(f"Error reading {filepath}: {e}")
                    
    out_lines = []
    out_lines.append(f"Found {len(results)} total double-slash eslint comments.\n")
    
    leaking_candidates = []
    for r in results:
        context_str = "".join(r['context'])
        has_tags = re.search(r'<\w+|/>|</\w+>', context_str)
        if has_tags:
            leaking_candidates.append(r)
            
    out_lines.append(f"Found {len(leaking_candidates)} candidates near JSX tags:\n")
    for idx, c in enumerate(leaking_candidates):
        out_lines.append(f"\n--- Candidate #{idx+1}: {c['file']}:{c['line_num']} ---\n")
        out_lines.append(f"Line: {c['line_content']}\n")
        out_lines.append("Context:\n")
        for offset, l in enumerate(c['context']):
            curr_line = c['context_start'] + offset
            prefix = "--> " if curr_line == c['line_num'] else "    "
            out_lines.append(f"{prefix}{curr_line:4d}: {l}")
            
    out_path = r"E:\SarayaERP\scratch\eslint_results.txt"
    with open(out_path, 'w', encoding='utf-8') as out_f:
        out_f.writelines(out_lines)
    print(f"Results written to {out_path}")

if __name__ == '__main__':
    scan_files()
