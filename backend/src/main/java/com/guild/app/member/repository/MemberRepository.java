package com.guild.app.member.repository;

import com.guild.app.common.enums.MemberStatus;
import com.guild.app.common.enums.Role;
import com.guild.app.member.entity.Member;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MemberRepository extends JpaRepository<Member, Long> {

    Optional<Member> findByEmail(String email);

    List<Member> findByNicknameIgnoreCaseAndStatusNotOrderById(String nickname, MemberStatus status);

    /**
     * Contas que usam este personagem do jogo (nickname sem diferenciar caixa). O nick nao e unico no
     * site: quem compartilha o personagem tem uma conta cada, e todas recebem o que a DLL envia.
     * Contas excluidas mantem o nick e ficam de fora.
     */
    default List<Member> findByGameCharacter(String character) {
        return findByNicknameIgnoreCaseAndStatusNotOrderById(character, MemberStatus.EXCLUIDO);
    }

    Optional<Member> findByDiscordId(String discordId);

    List<Member> findByDiscordIdIn(Collection<String> discordIds);

    boolean existsByEmail(String email);

    boolean existsByDiscordId(String discordId);

    Optional<Member> findByRole(Role role);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT m FROM Member m WHERE m.id = :id")
    Optional<Member> findByIdForUpdate(Long id);

    List<Member> findByStatusOrderByPointsDesc(com.guild.app.common.enums.MemberStatus status);

    @Query("SELECT m FROM Member m LEFT JOIN FETCH m.characterClass WHERE m.id IN :ids")
    List<Member> findAllByIdInWithClass(Collection<Long> ids);
}
