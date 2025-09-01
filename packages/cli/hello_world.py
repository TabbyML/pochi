import sys

def main():
    # Check if a name argument was provided
    if len(sys.argv) > 1:
        name = sys.argv[1]
    else:
        name = "World"
    
    print(f"Hello, {name}!")

if __name__ == "__main__":
    main()