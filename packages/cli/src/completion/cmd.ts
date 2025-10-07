import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { Command } from "@commander-js/extra-typings";
import chalk from "chalk";

export function registerCompletionCommand(program: CommandUnknownOpts) {
  const completionCommand = new Command("completion")
    .description("Generate shell completion scripts")
    .option("--bash", "Generate bash completion script")
    .option("--zsh", "Generate zsh completion script")
    .option("--fish", "Generate fish completion script")
    .action((options) => {
      const guide = "Copy and run below command. Then reload your terminal.\n";
      if (options.bash) {
        console.log(guide);
        console.log(bashCompletionCoammand);
      } else if (options.zsh) {
        console.log(guide);
        console.log(zshCompletionCoammand);
      } else if (options.fish) {
        console.log(guide);
        console.log(fishCompletionCoammand);
      } else {
        console.log(chalk.yellow("Choose shell: --bash, --zsh, or --fish"));
        console.log("");
        console.log("Examples:");
        console.log(chalk.cyan("  pochi completion --bash"));
        console.log(chalk.cyan("  pochi completion --zsh"));
        console.log(chalk.cyan("  pochi completion --fish"));
      }
    });

  program.addCommand(completionCommand);
}

const zshCompletionCoammand = `
  cat > ".pochi/.pochi-completion.sh" << 'EOF'
if type compdef &>/dev/null; then
  _pochi_completion() {
    local reply
    local si=$IFS
    IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" pochi completion -- "\${words[@]}"))
    IFS=$si
    _describe 'values' reply
  }
  compdef _pochi_completion pochi
fi
EOF
`;

const bashCompletionCoammand = `
  cat > "$install_dir/.pochi-completion.sh" << 'EOF'
###-begin-pochi-completion-###
if type complete &>/dev/null; then
  _pochi_completion () {
    local words cword
    if type _get_comp_words_by_ref &>/dev/null; then
      _get_comp_words_by_ref -n = -n @ -n : -w words -i cword
    else
      cword="$COMP_CWORD"
      words=("\${COMP_WORDS[@]}")
    fi

    local si="$IFS"
    IFS=$'\n' COMPREPLY=($(COMP_CWORD="$cword" \
                           COMP_LINE="$COMP_LINE" \
                           COMP_POINT="$COMP_POINT" \
                           pochi completion -- "\${words[@]}" \
                           2>/dev/null)) || return $?
    IFS="$si"
    if type __ltrim_colon_completions &>/dev/null; then
      __ltrim_colon_completions "\${words[cword]}"
    fi
  }
  complete -o default -F _pochi_completion pochi
fi
###-end-pochi-completion-###
EOF
`;

const fishCompletionCoammand = `
  cat > "$.pochi/.pochi-completion.sh" << 'EOF'
###-begin-pochi-completion-###
function _pochi_completion
  set cmd (commandline -o)
  set cursor (commandline -C)
  set words (node -pe "'$cmd'.split(' ').length")

  set completions (eval env DEBUG="" COMP_CWORD="$words" COMP_LINE="$cmd " COMP_POINT="$cursor" pochi completion -- $cmd)

  for completion in $completions
    echo -e $completion
  end
end

complete -f -d 'pochi' -c pochi -a "(eval _pochi_completion)"
###-end-pochi-completion-###
EOF
`;