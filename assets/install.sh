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
        echo "linux-arm64"
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

# Determine the user's shell profile file
# Returns the absolute path to the profile file, or empty if not detected
# Supported: zsh, bash
_detect_shell_profile() {
  local shell_path="${SHELL:-}"
  local profile=""

  if echo "$shell_path" | grep -qi "zsh"; then
    profile="$HOME/.zshrc"
  elif echo "$shell_path" | grep -qi "bash"; then
    # On macOS bash often uses .bash_profile; otherwise .bashrc
    if [ -f "$HOME/.bash_profile" ] || [ ! -f "$HOME/.bashrc" ]; then
      profile="$HOME/.bash_profile"
    else
      profile="$HOME/.bashrc"
    fi
  fi

  echo "$profile"
}

# Append a block to a file if a marker is not present
# args: <file> <marker> <content_line>
_append_if_missing() {
  local file="$1"
  local marker="$2"
  local line="$3"

  mkdir -p "$(dirname "$file")"
  touch "$file"

  if ! grep -Fqs "$marker" "$file"; then
    {
      echo "$marker"
      echo "$line"
    } >>"$file"
    return 0
  fi
  return 1
}

# Configure shell auto-completion by sourcing the CLI's completion output
# args: <install_dir>
# Print manual instructions to set PATH and enable completion
print_shell_setup_instructions() {
  local install_dir="$1"
  local bin_dir="$install_dir/bin"

  info 'Next steps' "Add the following to your shell profile:"
  eprintf ""
  eprintf "    bash ~/.bashrc:"
  eprintf ""
  eprintf "        export PATH=\"$bin_dir:\$PATH\""
  eprintf "        source <(pochi --completion)"
  eprintf ""
  eprintf "    zsh ~/.zshrc:"
  eprintf ""
  eprintf "        export PATH=\"$bin_dir:\$PATH\""
  eprintf "        source <(pochi --completion --zsh)"
  eprintf ""
  eprintf "    fish ~/.config/fish/config.fish:"
  eprintf ""
  eprintf "        export PATH=\"$bin_dir:\$PATH\""
  eprintf "        pochi --completion --fish | source"
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
