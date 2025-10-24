import { Console } from "node:console";
import type { CommandUnknownOpts } from "@commander-js/extra-typings";
import { initializeShellCompletion } from "./tree";

// Shell Completion shall output to stdout
const console = new Console(process.stdout);

export function handleShellCompletion(
  program: CommandUnknownOpts,
  argv: string[],
) {
  if (argv[3] === "--") {
    const shellCompletion = initializeShellCompletion(program);
    shellCompletion.completion();
  } else if (argv.includes("--zsh")) {
    console.log(zshCompletionCommand);
  } else if (argv.includes("--fish")) {
    console.log(fishCompletionCommand);
  } else {
    console.log(bashCompletionCommand);
  }
}

const zshCompletionCommand = `
###-begin-pochi-completion-###
if type compdef &>/dev/null; then
  _pochi_completion() {
    local reply
    local si=$IFS
    IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" pochi --completion -- "\${words[@]}"))
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
                           pochi --completion -- "\${words[@]}" \
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

  set completions (eval env DEBUG="" COMP_CWORD="$words" COMP_LINE="$cmd " COMP_POINT="$cursor" pochi --completion -- $cmd)

  for completion in $completions
    echo -e $completion
  end
end

complete -f -d 'pochi' -c pochi -a "(eval _pochi_completion)"
###-end-pochi-completion-###
`;
