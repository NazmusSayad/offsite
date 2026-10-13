__sshtty_status=($?) __sshtty_last=("$_")
__sshtty_aliases=(${options[aliases]})
'builtin' 'unsetopt' 'aliases'
builtin unset ZDOTDIR

if [[ -o interactive ]]; then
    __sshtty_install() {
        {
            builtin emulate -L zsh
            __sshtty_running=0
            precmd_functions=(${precmd_functions:#__sshtty_install} __sshtty_precmd)
            preexec_functions+=(__sshtty_preexec)
            if [[ ${widgets[zle-line-init]} == user:azhw:* ]] && (( $+functions[add-zle-hook-widget] )); then
                add-zle-hook-widget zle-line-init __sshtty_line_init
            else
                if (( $+widgets[zle-line-init] )); then
                    builtin zle -A zle-line-init __sshtty_line_init_original
                fi
                builtin zle -N zle-line-init __sshtty_line_init
            fi
            __sshtty_precmd
        } 2>/dev/null
    }

    __sshtty_precmd() {
        {
            builtin local exit_status=$?
            builtin emulate -L zsh
            if builtin zle; then
                builtin return
            fi
            if (( __sshtty_running )); then
                builtin print -n "\e]6973;D;${exit_status}\a"
            fi
            __sshtty_running=0
            builtin print -n '\e]6973;A\a'
        } 2>/dev/null
    }

    __sshtty_preexec() {
        {
            builtin emulate -L zsh
            builtin print -n '\e]6973;C\a'
            __sshtty_running=1
        } 2>/dev/null
    }

    __sshtty_line_init() {
        if [[ $CONTEXT == start ]]; then
            builtin print -n '\e]6973;B\a'
        fi
        if (( ${+widgets[__sshtty_line_init_original]} )); then
            builtin zle __sshtty_line_init_original -N -- "$@"
        fi
    }
fi

{
    {
        __sshtty_argzero=(0)
        if [[ $__sshtty_aliases == on ]]; then
            builtin setopt aliases
        fi
        if [[ -r "$HOME/.zshenv" ]]; then
            __sshtty_file=("${(%):-%x}")
            if [[ -o function_argzero ]]; then
                __sshtty_argzero=(1)
                builtin unsetopt function_argzero
                builtin trap 'if [[ ${(%):-%x} != "$__sshtty_file" ]]; then __sshtty_argzero=(0); builtin setopt function_argzero; builtin trap - DEBUG; fi' DEBUG
            fi
            () { builtin return $__sshtty_status; } && builtin :
            builtin source "$HOME/.zshenv"
            () {
                __sshtty_status=($1) __sshtty_last=("$2")
            } $? "$_" 2>/dev/null
            {
                builtin return $__sshtty_status
            } 2>/dev/null
        fi
        builtin return $__sshtty_status
    } always {
        {
            () {
                builtin emulate -L zsh
                TRY_BLOCK_ERROR=0
                if [[ -o interactive ]]; then
                    precmd_functions+=(__sshtty_install)
                fi
            }
            if (( __sshtty_argzero )); then
                builtin setopt function_argzero
                builtin trap - DEBUG
            fi
            () {
                builtin unset __sshtty_file __sshtty_argzero __sshtty_aliases __sshtty_status __sshtty_last
            } "$__sshtty_last"
        } 2>/dev/null
    }
    { :; : ${__sshtty_status:?}; } 2>/dev/null
}
