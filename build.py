from pathlib import Path
from shutil import copyfile
import subprocess
import sys


ROOT = Path(__file__).resolve().parent


def main():
    for builder in ('work/arrow_playable/build.py', 'work/arrow_360/build_360.py'):
        subprocess.run([sys.executable, str(ROOT / builder)], cwd=ROOT, check=True)
    copyfile(ROOT / 'outputs' / 'ArrowIO_DienSao_360.html', ROOT / 'index.html')


if __name__ == '__main__':
    main()
