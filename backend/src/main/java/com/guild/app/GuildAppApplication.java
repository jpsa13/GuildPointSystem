package com.guild.app;

import com.guild.app.discord.DiscordBotProperties;
import com.guild.app.schedule.ScheduleTestAlertProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.oauth2.client.servlet.OAuth2ClientAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = OAuth2ClientAutoConfiguration.class)
@EnableScheduling
@EnableConfigurationProperties({ScheduleTestAlertProperties.class, DiscordBotProperties.class})
public class GuildAppApplication {

    public static void main(String[] args) {
        SpringApplication.run(GuildAppApplication.class, args);
    }
}
