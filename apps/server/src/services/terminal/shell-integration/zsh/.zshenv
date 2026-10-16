__offsite_status=($?) __offsite_last=("$_")
__offsite_aliases=(${options[aliases]})
'builtin' 'unsetopt' 'aliases'
builtin unset ZDOTDIR

if [[ -o interactive ]]; then
    __offsite_install() {
        {
            builtin emulate -L zsh
            __offsite_running=0
            precmd_functions=(${precmd_functions:#__offsite_install} __offsite_precmd)
            preexec_functions+=(__offsite_preexec)
            if [[ ${widgets[zle-line-init]} == user:azhw:* ]] && (( $+functions[add-zle-hook-widget] )); then
                add-zle-hook-widget zle-line-init __offsite_line_init
            else
                if (( $+widgets[zle-line-init] )); then
                    builtin zle -A zle-line-init __offsite_line_init_original
                fi
                builtin zle -N zle-line-init __offsite_line_init
            fi
            __offsite_precmd
        } 2>/dev/null
    }

    __offsite_precmd() {
        {
            builtin local exit_status=$?
            builtin emulate -L zsh
            if builtin zle; then
                builtin return
            fi
            if (( __offsite_running )); then
                builtin print -n "\e]6973;D;${exit_status}\a"
            fi
            __offsite_running=0
            builtin print -n '\e]6973;A\a'
        } 2>/dev/null
    }

    __offsite_preexec() {
        {
            builtin emulate -L zsh
            builtin print -n '\e]6973;C\a'
            __offsite_running=1
        } 2>/dev/null
    }

    __offsite_line_init() {
        if [[ $CONTEXT == start ]]; then
            builtin print -n '\e]6973;B\a'
        fi
        if (( ${+widgets[__offsite_line_init_original]} )); then
            builtin zle __offsite_line_init_original -N -- "$@"
        fi
    }
fi

{
    {
        __offsite_argzero=(0)
        if [[ $__offsite_aliases == on ]]; then
            builtin setopt aliases
        fi
        if [[ -r "$HOME/.zshenv" ]]; then
            __offsite_file=("${(%):-%x}")
            if [[ -o function_argzero ]]; then
                __offsite_argzero=(1)
                builtin unsetopt function_argzero
                builtin trap 'if [[ ${(%):-%x} != "$__offsite_file" ]]; then __offsite_argzero=(0); builtin setopt function_argzero; builtin trap - DEBUG; fi' DEBUG
            fi
            () { builtin return $__offsite_status; } && builtin :
            builtin source "$HOME/.zshenv"
            () {
                __offsite_status=($1) __offsite_last=("$2")
            } $? "$_" 2>/dev/null
            {
                builtin return $__offsite_status
            } 2>/dev/null
        fi
        builtin return $__offsite_status
    } always {
        {
            () {
                builtin emulate -L zsh
                TRY_BLOCK_ERROR=0
                if [[ -o interactive ]]; then
                    precmd_functions+=(__offsite_install)
                fi
            }
            if (( __offsite_argzero )); then
                builtin setopt function_argzero
                builtin trap - DEBUG
            fi
            () {
                builtin unset __offsite_file __offsite_argzero __offsite_aliases __offsite_status __offsite_last
            } "$__offsite_last"
        } 2>/dev/null
    }
    { :; : ${__offsite_status:?}; } 2>/dev/null
}
