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
      if (options.bash) {
        console.log(bashCompletionCommand);
      } else if (options.zsh) {
        console.log(zshCompletionCommand);
      } else if (options.fish) {
        console.log(fishCompletionCommand);
      } else {
        console.log(chalk.yellow("Choose shell: --bash, --zsh, or --fish"));
        console.log("");
        console.log("Examples:");
        console.log(chalk.cyan("  pochi completion --bash"));
        console.log(chalk.cyan("  pochi completion --zsh"));
        console.log(chalk.cyan("  pochi completion --fish"));
        console.log("");
        console.log("Usage:");
        console.log(chalk.cyan("  add those in your profile file (e.g. ~/.bashrc, ~/.zshrc), after the PATH export"));
        console.log(chalk.cyan("  source <(pochi completion --bash)"));
        console.log(chalk.cyan("  source <(pochi completion --zsh)"));
        console.log(chalk.cyan("  pochi completion --fish | source"));
      }
    });

  program.addCommand(completionCommand);
}

const zshCompletionCommand = `
###-begin-pochi-completion-###
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
###-end-pochi-completion-###
`;

const bashCompletionCommand = `
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
`;

const fishCompletionCommand = `
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
`;
