builtin unset ZDOTDIR

if [[ -o interactive ]]; then
    __sshtty_active=0
    __sshtty_running=0

    __sshtty_install() {
        precmd_functions=(${precmd_functions:#__sshtty_install} __sshtty_precmd)
        preexec_functions+=(__sshtty_preexec)
        __sshtty_precmd
    }

    __sshtty_precmd() {
        builtin local exit_status=$? prompt_percent=0
        if [[ -o prompt_percent ]]; then
            prompt_percent=1
        fi
        builtin emulate -L zsh
        if builtin zle; then
            builtin return
        fi
        if (( __sshtty_running )); then
            builtin print -n "\e]133;D;${exit_status}\a"
        fi
        __sshtty_running=0
        if [[ ${precmd_functions[-1]} != __sshtty_precmd ]]; then
            precmd_functions=(${precmd_functions:#__sshtty_precmd} __sshtty_precmd)
        fi
        if [[ $PS1 == *'133;A'* ]]; then
            __sshtty_active=0
            builtin return
        fi
        __sshtty_active=1
        builtin print -n '\e]133;A\a'
        if (( prompt_percent )) && [[ $PS1 != *'133;B'* ]]; then
            if [[ $PS1 == *[^%]% || $PS1 == % ]]; then
                PS1+=%
            fi
            PS1+=$'%{\e]133;B\a%}'
        fi
    }

    __sshtty_preexec() {
        if (( __sshtty_active )); then
            builtin print -n '\e]133;C\a'
            __sshtty_running=1
        fi
    }
fi

if [[ -r ${ZDOTDIR:-$HOME}/.zshenv ]]; then
    builtin source ${ZDOTDIR:-$HOME}/.zshenv
fi

if [[ -o interactive ]]; then
    builtin typeset -ga precmd_functions preexec_functions
    precmd_functions+=(__sshtty_install)
fi
