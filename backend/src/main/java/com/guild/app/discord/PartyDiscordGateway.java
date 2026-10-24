package com.guild.app.discord;

import lombok.RequiredArgsConstructor;
import net.dv8tion.jda.api.Permission;
import net.dv8tion.jda.api.JDA;
import net.dv8tion.jda.api.entities.channel.concrete.TextChannel;
import net.dv8tion.jda.api.entities.emoji.Emoji;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.TimeUnit;

@Component @RequiredArgsConstructor
public class PartyDiscordGateway {
    public record Checkmark(String channelId,String messageId,String userId) {}
    private final DiscordMemberService discord;
    private final DiscordBotProperties properties;
    public String channelId() { return properties.getPartyChannelId(); }
    public String unavailable() {
        if(!properties.isEnabled() || channelId().isBlank() || properties.getGuildId().isBlank())
            return "Bot e canal de chamadas ainda não configurados neste ambiente.";
        try { channel(channelId()); return null; }
        catch(IllegalStateException e) { return e.getMessage(); }
    }
    private TextChannel channel(String id) {
        var jda=discord.client();
        if(jda==null || jda.getStatus()!=JDA.Status.CONNECTED) throw new IllegalStateException("Bot do Discord desconectado.");
        var c=jda.getTextChannelById(id);
        if(c==null || !c.getGuild().getId().equals(properties.getGuildId()) || !id.equals(channelId()))
            throw new IllegalStateException("Canal de chamadas indisponível no servidor configurado.");
        if(!c.getGuild().getSelfMember().hasPermission(c,Permission.VIEW_CHANNEL,Permission.MESSAGE_SEND,
                Permission.MESSAGE_HISTORY,Permission.MESSAGE_ADD_REACTION))
            throw new IllegalStateException("O bot precisa ver o canal, enviar mensagens, ler histórico e adicionar reações.");
        return c;
    }
    public Set<String> confirmations(String channelId,List<String> messageIds) throws Exception {
        var c=channel(channelId);
        Set<String> ids=new HashSet<>();
        for(String message:messageIds) {
            c.retrieveReactionUsersById(message,Emoji.fromUnicode("✅")).forEachAsync(u->{
                if(!u.isBot()) ids.add(u.getId());
                return true;
            }).get(15,TimeUnit.SECONDS);
        }
        return ids;
    }
    public String send(String channelId,String label,int number,Set<String> recipients) throws Exception {
        var c=channel(channelId);
        if(recipients.isEmpty()) throw new IllegalArgumentException("No recipients");
        String mentions=String.join(" ",recipients.stream().map(id->"<@"+id+">").toList());
        String content="📣 **"+label.replace("@","＠").replace("*","").replace("`","").replace('\n',' ')
            +" — chamada "+number+"/3**\n"+mentions
            +"\nReaja com ✅ em uma mensagem desta rodada para não receber os próximos lembretes.\nHorários da rodada: início, +2min30s e +5min.";
        var message=c.sendMessage(content).setAllowedMentions(Collections.emptySet()).mentionUsers(recipients)
            .submit().get(15,TimeUnit.SECONDS);
        // A failed seed must stop reminders, but the already-sent message remains tracked.
        return message.getId();
    }
    public void seedCheckmark(String channelId,String messageId) throws Exception {
        channel(channelId).addReactionById(messageId,Emoji.fromUnicode("✅")).submit().get(15,TimeUnit.SECONDS);
    }
    public String url(String channelId,String messageId) {
        return "https://discord.com/channels/"+properties.getGuildId()+"/"+channelId+"/"+messageId;
    }
}
