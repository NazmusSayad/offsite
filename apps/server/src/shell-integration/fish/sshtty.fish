if status is-interactive
    set --local native 0
    if test (string match --regex '^\d+' -- $version) -ge 4
        status test-feature mark-prompt
        if test $status -ne 1
            set native 1
        end
    end
    if test $native = 0
        function __sshtty_prompt_start --on-event fish_prompt
            printf '\e]6973;A\a'
        end

        function __sshtty_output_start --on-event fish_preexec
            printf '\e]6973;C\a'
        end

        function __sshtty_output_end --on-event fish_postexec
            printf '\e]6973;D;%s\a' $status
        end
    end
end
