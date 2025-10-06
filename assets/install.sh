#!/usr/bin/env bash

release_url() {
  echo "https://github.com/TabbyML/pochi/releases"
}

download_release_from_repo() {
  local version="$1"
  local os_info="$2"
  local tmpdir="$3"

  local filename="pochi-$os_info.tar.gz"
  local download_file="$tmpdir/$filename"
  local archive_url="$(release_url)/download/$version/$filename"

  curl --progress-bar --show-error --location --fail "$archive_url" --output "$download_file" --write-out "$download_file"
}

usage() {
    cat >&2 <<END_USAGE
pochi-install: The installer for Pochi

USAGE:
    pochi-install [FLAGS] [OPTIONS]

FLAGS:
    -h, --help                  Prints help information

END_USAGE
}

info() {
  local action="$1"
  local details="$2"
  command printf '\033[1;32m%12s\033[0m %s\n' "$action" "$details" 1>&2
}

error() {
  command printf '\033[1;31mError\033[0m: %s\n\n' "$1" 1>&2
}

warning() {
  command printf '\033[1;33mWarning\033[0m: %s\n\n' "$1" 1>&2
}

request() {
  command printf '\033[1m%s\033[0m\n' "$1" 1>&2
}

eprintf() {
  command printf '%s\n' "$1" 1>&2
}

bold() {
  command printf '\033[1m%s\033[0m' "$1"
}

# Check if it is OK to upgrade to the new version
upgrade_is_ok() {
  return 0
}

# returns the os name to be used in the packaged release
parse_os_info() {
  local uname_str="$1"
  local arch="$(uname -m)"

  case "$uname_str" in
    Linux)
      if [ "$arch" == "x86_64" ]; then
        echo "linux-x64"
      elif [ "$arch" == "aarch64" ]; then
        echo "linux-arm"
      else
        error "Releases for architectures other than x64 and arm are not currently supported."
        return 1
      fi
      ;;
    Darwin)
      echo "mac-arm64"
      ;;
    *)
      return 1
  esac
  return 0
}

parse_os_pretty() {
  local uname_str="$1"

  case "$uname_str" in
    Linux)
      echo "Linux"
      ;;
    Darwin)
      echo "macOS"
      ;;
    *)
      echo "$uname_str"
  esac
}

create_tree() {
  local install_dir="$1"

  info 'Creating' "directory layout"

  # .pochi/
  #     bin/

  mkdir -p "$install_dir" && mkdir -p "$install_dir"/bin
  if [ "$?" != 0 ]
  then
    error "Could not create directory layout. Please make sure the target directory is writeable: $install_dir"
    exit 1
  fi
}

# Configure shell auto-completion by sourcing the CLI's completion output
# args: <install_dir>
# Print manual instructions to set PATH and enable completion
print_shell_setup_instructions() {
  local install_dir="$1"
  local bin_dir="$install_dir/bin"

  info 'Next steps' "Follow these steps to complete the installation:"
  eprintf ""
  eprintf " 1. Add Pochi to your PATH by adding this line to your shell profile:"
  eprintf "   (e.g., ~/.zshrc for zsh or ~/.bashrc for bash)"
  eprintf ""
  eprintf "   export PATH=\"$bin_dir:\$PATH\""
  eprintf ""
  eprintf " 2. Restart your terminal or reload your shell configuration:"
  eprintf "   source ~/.zshrc  # for zsh users"
  eprintf "   source ~/.bashrc # for bash users"
  eprintf ""
  eprintf " 3. Set up shell auto-completion by creating the completion file:"
  eprintf "   cat > $install_dir/.pochi-completion.zsh << 'EOF'"
  eprintf "   if type compdef &>/dev/null; then"
  eprintf "     _pochi_completion() {"
  eprintf "       local reply"
  eprintf "       local si=\$IFS"
  eprintf "       IFS=\$'\\n' reply=(\$(COMP_CWORD=\"\$((CURRENT-1))\" COMP_LINE=\"\$BUFFER\" COMP_POINT=\"\$CURSOR\" pochi completion -- \"\${words[@]}\"))"
  eprintf "       IFS=\$si"
  eprintf "       _describe 'values' reply"
  eprintf "     }"
  eprintf "     compdef _pochi_completion pochi"
  eprintf "   fi"
  eprintf "   EOF"
  eprintf ""
  eprintf "   Then add this line to your shell profile (~/.zshrc):"
  eprintf "   source $install_dir/.pochi-completion.zsh"
  eprintf ""
}

install_version() {
  local version_to_install="$1"
  local install_dir="$2"

  case "$version_to_install" in
    latest)
      local latest_version="latest"
      info 'Installing' "latest version of Pochi ($latest_version)"
      install_release "$latest_version" "$install_dir"
      ;;
    *)
      # assume anything else is a specific version
      info 'Installing' "Pochi version $version_to_install"
      install_release "$version_to_install" "$install_dir"
      ;;
  esac

  if [ "$?" == 0 ]
  then
    "$install_dir"/bin/pochi-code --version &>/dev/null # creates the default shims
    # Set up shell auto-completion
    print_shell_setup_instructions "$install_dir"
    info 'Finished' "Pochi is installed at $install_dir/bin"
  fi
}

install_release() {
  local version="$1"
  local install_dir="$2"

  info 'Checking' "for existing Pochi installation"
  if upgrade_is_ok "$version" "$install_dir"
  then
    download_archive="$(download_release "$version"; exit "$?")"
    exit_status="$?"
    if [ "$exit_status" != 0 ]
    then
      error "Could not download Pochi version '$version'. See $(release_url) for a list of available releases"
      return "$exit_status"
    fi

    install_from_file "$download_archive" "$install_dir"
  else
    # existing legacy install, or upgrade problem
    return 1
  fi
}

download_release() {
  local version="$1"

  local uname_str="$(uname -s)"
  local os_info
  os_info="$(parse_os_info "$uname_str")"
  if [ "$?" != 0 ]; then
    error "The current operating system ($uname_str) does not appear to be supported by Pochi."
    return 1
  fi
  local pretty_os_name="$(parse_os_pretty "$uname_str")"

  info 'Fetching' "archive for $pretty_os_name, version $version"
  # store the downloaded archive in a temporary directory
  local download_dir="$(mktemp -d)"
  download_release_from_repo "$version" "$os_info" "$download_dir"
}

install_from_file() {
  local archive="$1"
  local install_dir="$2"

  create_tree "$install_dir"

  info 'Extracting' "Pochi binaries and launchers"
  # extract the files to the specified directory
  tar -xf "$archive" -C "$install_dir"/bin
}

# return if sourced (for testing the functions above)
return 0 2>/dev/null

install_dir="${POCHI_HOME:-"$HOME/.pochi"}"
version_to_install=""

# parse command line options
if [ $# -gt 0 ]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      error "unknown option: '$1'"
      usage
      exit 1
      ;;
    *)
      version_to_install="$1"
      ;;
  esac
fi

get_latest_version() {
  curl -s https://api.github.com/repos/TabbyML/pochi/releases | grep 'tag_name' | grep 'cli@' | head -1 | cut -d '"' -f 4
}

if [ -z "$version_to_install" ]; then
  version_to_install=$(get_latest_version)
fi

version_to_install="${version_to_install/pochi-v/cli@}"

install_version "$version_to_install" "$install_dir"
