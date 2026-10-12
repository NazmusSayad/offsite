set --erase --global XDG_DATA_DIRS

if status is-interactive
    set --global __sshtty_native 0
    if test (string match --regex '^\d+' -- $version) -ge 4
        status test-feature mark-prompt
        if test $status -ne 1
            set __sshtty_native 1
        end
    end
    set --global __sshtty_running 0

    function __sshtty_prompt_start --on-event fish_prompt
        if functions --query fish_prompt; and not functions fish_prompt | string match --quiet '*__sshtty_fish_prompt*'
            functions --erase __sshtty_fish_prompt
            functions --copy fish_prompt __sshtty_fish_prompt
            function fish_prompt
                set --local text (__sshtty_fish_prompt $argv | string collect --no-trim-newlines)
                if string match --quiet '*]133;B*' -- $text
                    printf '%s' $text
                else
                    printf '%s\e]133;B\a' $text
                end
            end
        end
        if test $__sshtty_native = 0
            printf '\e]133;A\a'
        end
    end

    if test $__sshtty_native = 0
        function __sshtty_output_start --on-event fish_preexec
            printf '\e]133;C\a'
            set --global __sshtty_running 1
        end

        function __sshtty_output_end --on-event fish_postexec
            set --local exit_status $status
            if test $__sshtty_running = 1
                printf '\e]133;D;%s\a' $exit_status
            end
            set --global __sshtty_running 0
        end
    end
end
