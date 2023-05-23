import os

def main():
    print('hello')
    os.system('mkdir -p /tmp/test_of_python_script')
    os.system('touch /tmp/test_of_python_script/$(date +%Y%m%d%H%M%S)')

main()
