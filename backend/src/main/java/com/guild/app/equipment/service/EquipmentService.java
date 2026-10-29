package com.guild.app.equipment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.guild.app.common.enums.*;
import com.guild.app.common.exception.AppException;
import com.guild.app.common.security.SecurityUtils;
import com.guild.app.equipment.dto.EquipmentDtos.*;
import com.guild.app.equipment.repository.EquipmentRepository;
import com.guild.app.log.service.AuditLogService;
import com.guild.app.member.entity.Member;
import com.guild.app.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.core.io.ClassPathResource;
import java.io.IOException;
import java.util.zip.GZIPInputStream;
import java.time.LocalDate;
import java.time.ZoneId;
import java.math.BigDecimal;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly=true)
public class EquipmentService {
    private final EquipmentRepository repository;
    private final MemberRepository members;
    private final EquipmentEffectDictionary dictionary;
    private final AuditLogService audit;
    private final com.guild.app.websocket.WebSocketPublisher ws;
    private final ObjectMapper json;
    private final jakarta.validation.Validator validator;

    private Member actor(boolean mutation) {
        var actor=members.findById(SecurityUtils.currentMember().getId()).orElseThrow(()->error("Conta não encontrada.",HttpStatus.FORBIDDEN));
        if(actor.getStatus()!=MemberStatus.APROVADO || !actor.isProfileComplete() ||
            (mutation && !actor.getRole().isAtLeast(Role.ADMINISTRADOR)))
            throw error("Você não tem permissão para esta ação.",HttpStatus.FORBIDDEN);
        return actor;
    }
    private static AppException error(String message,HttpStatus status) { return new AppException(message,status); }
    private static void require(boolean condition,String message) {
        if(!condition) throw error(message,HttpStatus.BAD_REQUEST);
    }
    private static boolean categoryValid(String category) {
        return Arrays.stream(Slot.values()).anyMatch(s->s.category.equals(category));
    }
    @Transactional(readOnly=true,isolation=org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public List<MemberEquipment> board() {
        boolean admin=actor(false).getRole().isAtLeast(Role.ADMINISTRADOR);
        var board=repository.board();
        if(admin) return board;
        return board.stream().map(m->new MemberEquipment(m.memberId(),m.nickname(),m.level(),m.expPercent(),m.classId(),m.className(),m.classImageUrl(),m.slots().stream()
            .map(s->new CurrentSlot(s.slot(),s.version(),s.assignment()==null?null:s.assignment().withoutAudit())).toList())).toList();
    }
    public List<ReviewStatus> reviews() {
        var actor=actor(false);
        if(!actor.getRole().isAtLeast(Role.ADMINISTRADOR)) {
            var current=repository.review(actor.getId());
            return current==null?List.of():List.of(current);
        }
        return repository.board().stream().map(m->repository.review(m.memberId())).filter(Objects::nonNull).toList();
    }
    public List<Integer> relics(long memberId) {
        actor(false);
        var member=members.findById(memberId).orElseThrow(()->error("Membro não encontrado.",HttpStatus.NOT_FOUND));
        require(member.getStatus()==MemberStatus.APROVADO && member.isProfileComplete(),"O membro deve estar aprovado e com perfil completo.");
        return repository.relics(memberId);
    }
    @Transactional
    public List<Integer> setRelic(long memberId,int relicId,RelicState state) {
        var actor=actor(true);
        require(relicId>=0 && relicId<120 && state!=null && state.active()!=null,"Relic ou estado inválido.");
        var member=members.findByIdForUpdate(memberId).orElseThrow(()->error("Membro não encontrado.",HttpStatus.NOT_FOUND));
        require(member.getStatus()==MemberStatus.APROVADO && member.isProfileComplete(),"O membro deve estar aprovado e com perfil completo.");
        if(repository.setRelic(memberId,relicId,state.active()))
            audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,member,Map.of("action","RELIC","relicId",relicId,"active",state.active()));
        return repository.relics(memberId);
    }
    @Transactional
    public ReviewStatus requestReview(ReviewRequest request) {
        var actor=actor(true);
        var target=members.findByIdForUpdate(request.memberId()).orElseThrow(()->error("Membro não encontrado.",HttpStatus.NOT_FOUND));
        require(target.getStatus()==MemberStatus.APROVADO && target.isProfileComplete(),"O membro deve estar aprovado e com perfil completo.");
        var operation=repository.reviewOperation(request.operationId());
        if(operation!=null) {
            if(((Number)operation.get("member_id")).longValue()!=target.getId() || ((Number)operation.get("requested_by")).longValue()!=actor.getId())
                throw error("Identificador já utilizado.",HttpStatus.CONFLICT);
            return repository.review(target.getId());
        }
        var current=repository.review(target.getId());
        if(current!=null && current.confirmedAt()==null) return current;
        repository.requestReview(request.operationId(),target.getId(),actor.getId());
        var result=repository.review(target.getId());
        audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,target,Map.of("action","REVIEW_REQUEST","requestId",result.id(),"dueAt",result.dueAt()));
        return result;
    }
    @Transactional
    public ReviewStatus confirmReview(UUID id) {
        var actor=actor(false);
        members.findByIdForUpdate(actor.getId()).orElseThrow();
        var current=repository.review(actor.getId());
        if(current==null || !current.id().equals(id)) throw error("Solicitação não encontrada ou desatualizada.",HttpStatus.CONFLICT);
        if(repository.confirmReview(id,actor.getId())>0)
            audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,actor,Map.of("action","REVIEW_CONFIRM","requestId",id));
        return repository.review(actor.getId());
    }
    public List<Assignment> history(long id) { actor(true); return repository.history(id); }
    public Map<String,Object> importStatus() { actor(false); return repository.importStatus(); }
    public CatalogPage catalog(String category,String search,int page,int size) {
        return catalog(category,search,page,size,null,null,null);
    }
    public CatalogPage catalog(String category,String search,int page,int size,Integer level,Integer grade,String ability) {
        return catalog(category,search,page,size,level,grade,ability,"CORA",null);
    }
    public CatalogPage catalog(String category,String search,int page,int size,Integer level,Integer grade,String ability,String race,String equipmentClass) {
        return catalog(category,search,page,size,level,grade,ability,race,equipmentClass,null,null);
    }
    public CatalogPage catalog(String category,String search,int page,int size,Integer level,Integer grade,String ability,String race,String equipmentClass,String accessoryEffect,Integer weaponType) {
        actor(false);
        require(accessoryEffect==null || (Set.of("RING","AMULET").contains(category) && Set.of("ATTACK","DODGE","DEFENSE").contains(accessoryEffect)),"Filtro de acessório inválido.");
        require(weaponType==null || (category.equals("WEAPON") && weaponType>=0 && weaponType<=11),"Tipo de arma inválido.");
        require(Set.of("CORA","BELLATO","ACCRETIA","ALL").contains(race),"Raça inválida.");
        require(equipmentClass==null || Set.of("MELEE","RANGER","FORCE").contains(equipmentClass) || (category.equals("WEAPON") && equipmentClass.equals("LAUNCHER")),"Classe inválida.");
        require(level==null || (level>=0 && level<=99 && (!category.equals("WEAPON") || (level>=35 && level<=50))),"Nível inválido.");
        require(grade==null || grade==1 || grade==3,"Grade inválida; escolha B ou C.");
        require(ability==null || (ability.length()<=50 && ability.matches("[A-Za-z ]*")),"Habilidade inválida.");
        require(ability==null || ability.isBlank() || grade==null || grade==3,"Habilidades exigem Grade C.");
        require(categoryValid(category),"Categoria de equipamento inválida.");
        require(page>=0 && page<=100000 && size>=1 && size<=100 && search.length()<=200,"Filtro inválido.");
        return repository.catalog(category,search.trim(),page,size,level,grade,ability,race,equipmentClass,accessoryEffect,weaponType);
    }
    private Assignment owned(Long id,long memberId,Slot slot) {
        require(id!=null,"Selecione um registro do histórico.");
        var result=repository.assignment(id);
        require(result!=null && result.memberId()==memberId && result.slot()==slot,"Registro incompatível com membro/posição.");
        require(result.status().equals("ACTIVE"),"Esse registro já foi cancelado, corrigido ou repassado.");
        return result;
    }
    private Assignment newAssignment(Operation op,long actorId,Long correctsId) {
        require(op.catalogId()!=null && op.effectKey()!=null && op.origin()!=null && op.occurredOn()!=null,"Preencha item, efeito, origem e data.");
        require(!op.occurredOn().isAfter(LocalDate.now(ZoneId.of("America/Sao_Paulo"))),"A data não pode estar no futuro.");
        var item=repository.catalogItem(op.catalogId());
        require(item!=null && op.slot().category.equals(item.category()),"Item não disponível ou incompatível com a posição.");
        var effect=item.effects().stream().filter(e->e.key().equals(op.effectKey())).findFirst()
            .orElseThrow(()->error("Selecione um efeito disponível para esse modelo.",HttpStatus.BAD_REQUEST));
        return repository.create(op,item,effect,item.sourceHash(),actorId,correctsId);
    }
    @Transactional
    public SlotEditResult editSlots(SlotEdit request) {
        var actor=actor(false);
        boolean admin=actor.getRole().isAtLeast(Role.ADMINISTRADOR);
        if(!admin && !actor.getId().equals(request.memberId()))
            throw error("Você pode remover ou restaurar somente os próprios equipamentos.",HttpStatus.FORBIDDEN);
        var member=members.findByIdForUpdate(request.memberId()).orElseThrow(()->error("Membro não encontrado.",HttpStatus.NOT_FOUND));
        require(member.getStatus()==MemberStatus.APROVADO && member.isProfileComplete(),"O membro deve estar aprovado e com perfil completo.");
        var previous=repository.slotEdit(request.operationId());
        if(previous!=null) {
            if(((Number)previous.get("actor_id")).longValue()!=actor.getId() || !repository.decode(previous.get("request").toString(),SlotEdit.class).equals(request))
                throw error("Identificador de operação já utilizado com outros dados.",HttpStatus.CONFLICT);
            return visibleSlotEdit(repository.decode(previous.get("after_state").toString(),SlotEditResult.class),admin);
        }
        require(request.slots()!=null && !request.slots().isEmpty() && request.slots().size()<=12,"Selecione as posições a alterar.");
        var unique=new HashSet<Slot>();
        var before=new ArrayList<CurrentSlot>();
        for(var input:request.slots()) {
            require(unique.add(input.slot()),"Posição repetida.");
            var current=repository.slot(member.getId(),input.slot());
            if(current.version()!=input.expectedVersion())
                throw error("Os equipamentos mudaram em outra sessão. Atualize antes de tentar novamente.",HttpStatus.CONFLICT);
            before.add(current);
        }
        var restore=new HashMap<Slot,Assignment>();
        if(request.reversesOperationId()!=null) {
            var prior=repository.slotEdit(request.reversesOperationId());
            require(prior!=null && ((Number)prior.get("actor_id")).longValue()==actor.getId() && ((Number)prior.get("member_id")).longValue()==member.getId(),"Operação indisponível para desfazer/refazer.");
            var expected=repository.decode(prior.get("after_state").toString(),SlotEditResult.class);
            require(expected.slots().size()==before.size(),"Selecione todas as posições da operação original.");
            for(var current:before) require(expected.slots().stream().anyMatch(s->s.slot()==current.slot() && s.version()==current.version()),"A operação original foi substituída por outra alteração.");
            for(var original:repository.decode(prior.get("before_state").toString(),SlotEditResult.class).slots())
                restore.put(original.slot(),original.assignment()==null?null:owned(original.assignment().id(),member.getId(),original.slot()));
        } else for(var current:before) require(current.assignment()!=null,"Esta posição já está vazia.");
        for(var current:before) {
            var target=restore.get(current.slot());
            repository.setSlot(member.getId(),current.slot(),target==null?null:target.id());
        }
        var after=new SlotEditResult(request.operationId(),member.getId(),before.stream().map(s->repository.slot(member.getId(),s.slot())).toList());
        repository.rememberSlotEdit(request,actor.getId(),new SlotEditResult(request.operationId(),member.getId(),before),after);
        var payload=new LinkedHashMap<String,Object>();
        payload.put("action",request.reversesOperationId()==null?(before.size()>1?"CLEAR":"REMOVE"):"UNDO_REDO");
        payload.put("operationId",request.operationId()); payload.put("reversesOperationId",request.reversesOperationId());
        payload.put("slot",String.join(", ",before.stream().map(s->s.slot().name()).toList()));
        payload.put("before",before); payload.put("after",after.slots());
        audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,member,payload);
        return visibleSlotEdit(after,admin);
    }
    private SlotEditResult visibleSlotEdit(SlotEditResult result,boolean admin) {
        if(admin) return result;
        return new SlotEditResult(result.operationId(),result.memberId(),result.slots().stream()
            .map(s->new CurrentSlot(s.slot(),s.version(),s.assignment()==null?null:s.assignment().withoutAudit())).toList());
    }
    @Transactional
    public Assignment operate(Operation op) {
        var actor=actor(false);
        boolean admin=actor.getRole().isAtLeast(Role.ADMINISTRADOR);
        if(op.quantity()!=null) {
            if(!admin) throw error("Somente administradores podem registrar entregas em quantidade.",HttpStatus.FORBIDDEN);
            require(op.quantity().compareTo(BigDecimal.ONE)>=0 && op.quantity().compareTo(BigDecimal.valueOf(100))<=0 && op.quantity().stripTrailingZeros().scale()<=0,"Informe uma quantidade inteira entre 1 e 100.");
            require(op.action()==Action.CREATE && !op.useAsCurrent() && op.origin()==Origin.GUILD_DISTRIBUTION && op.transfer()==null,
                "Quantidade é permitida somente para entregas sem equipar.");
        }
        require(op.origin()!=Origin.GAME_CLIENT || op.action()!=Action.CREATE,"A origem do jogo é exclusiva da sincronização do cliente.");
        if(op.transfer()!=null && !admin)
            throw error("Somente administradores podem repassar equipamentos.",HttpStatus.FORBIDDEN);
        if(!admin && (!actor.getId().equals(op.memberId()) || op.action()!=Action.CREATE || !op.useAsCurrent()))
            throw error("Você pode atualizar somente o seu equipamento atual.",HttpStatus.FORBIDDEN);
        // A ordem dos bloqueios evita deadlock em repasses simultâneos entre os mesmos membros.
        var locked=new HashMap<Long,Member>();
        var memberIds=new TreeSet<Long>(); memberIds.add(op.memberId());
        if(op.transfer()!=null) {
            require(op.transfer().memberId()!=null && op.transfer().expectedVersion()!=null,"Informe o destinatário e sua versão.");
            require(!op.memberId().equals(op.transfer().memberId()),"Escolha outro personagem para o repasse.");
            require((op.action()==Action.CREATE && op.useAsCurrent()) || (op.action()==Action.TRANSFER && !op.useAsCurrent()),"Dados de repasse inválidos.");
            memberIds.add(op.transfer().memberId());
        }
        for(var id:memberIds) locked.put(id,members.findByIdForUpdate(id)
            .orElseThrow(()->error("Membro não encontrado.",HttpStatus.NOT_FOUND)));
        var member=locked.get(op.memberId());
        require(member.getStatus()==MemberStatus.APROVADO && member.isProfileComplete(),"O membro deve estar aprovado e com perfil completo.");
        var previous=repository.previous(op.operationId());
        if(!previous.isEmpty()) {
            if(!repository.sameRequest(previous.getFirst(),actor.getId(),op))
                throw error("Identificador de operação já utilizado com outros dados.",HttpStatus.CONFLICT);
            var saved=repository.assignment(((Number)previous.getFirst().get("assignment_id")).longValue());
            return admin?saved:saved.withoutAudit();
        }
        var current=repository.slot(member.getId(),op.slot());
        if(op.quantity()==null && current.version()!=op.expectedVersion())
            throw error("Esta posição mudou em outra sessão. Atualize e confirme novamente.",HttpStatus.CONFLICT);
        Member recipient=null;
        CurrentSlot destination=null;
        Assignment transferSource=current.assignment();
        if(op.transfer()!=null) {
            if(op.action()==Action.TRANSFER && op.assignmentId()!=null) {
                transferSource=owned(op.assignmentId(),member.getId(),op.slot());
                require(!Boolean.TRUE.equals(transferSource.deliveryOnly()) && !repository.isEquipped(transferSource.id()),
                    "Este item não está disponível nos equipamentos anteriores. Atualize a lista.");
            }
            require(transferSource!=null && transferSource.status().equals("ACTIVE"),"Não há equipamento válido para repassar.");
            recipient=locked.get(op.transfer().memberId());
            require(recipient.getStatus()==MemberStatus.APROVADO && recipient.isProfileComplete(),"O destinatário deve estar aprovado e com perfil completo.");
            Slot target=op.transfer().slot()==null?op.slot():op.transfer().slot();
            boolean accessory=op.slot().category.equals("RING") || op.slot().category.equals("AMULET");
            require(target==op.slot() || (accessory && target.category.equals(op.slot().category)),"Posição de destino incompatível com o repasse.");
            destination=repository.slot(recipient.getId(),target);
            if(destination.version()!=op.transfer().expectedVersion())
                throw error("O equipamento do destinatário mudou. Atualize e confirme novamente.",HttpStatus.CONFLICT);
            require(destination.assignment()==null || op.transfer().replaceCurrent(),"Confirme a substituição do equipamento do destinatário.");
        }
        Assignment result;
        var createdIds=new ArrayList<Long>();
        switch(op.action()) {
            case TRANSFER -> {
                require(op.transfer()!=null,"Escolha o destinatário do equipamento.");
                require(op.catalogId()==null && op.replacementId()==null && op.restoration()==null,
                    "O envio utiliza um registro de equipamento existente.");
                result=transferSource;
                if(op.assignmentId()==null) repository.setSlot(member.getId(),op.slot(),null);
            }
            case CREATE -> {
                require(op.replacementId()==null && op.assignmentId()==null,"Dados de entrega inválidos.");
                result=newAssignment(op,actor.getId(),null);
                createdIds.add(result.id());
                for(int unit=1;unit<(op.quantity()==null?1:op.quantity().intValueExact());unit++)
                    createdIds.add(newAssignment(op,actor.getId(),null).id());
                if(op.useAsCurrent()) repository.setSlot(member.getId(),op.slot(),result.id());
            }
            case EQUIP -> {
                result=owned(op.assignmentId(),member.getId(),op.slot());
                require(current.assignment()==null || current.assignment().id()!=result.id(),"Este equipamento já está nesta posição.");
                repository.setSlot(member.getId(),op.slot(),result.id());
            }
            case CORRECT, CANCEL -> {
                require(op.reason()!=null && !op.reason().isBlank(),"Informe o motivo da correção/cancelamento.");
                var original=owned(op.assignmentId(),member.getId(),op.slot());
                require(op.action()!=Action.CORRECT || op.origin()!=Origin.GAME_CLIENT || original.origin()==Origin.GAME_CLIENT,
                    "Somente registros enviados pelo jogo mantêm essa origem na correção.");
                boolean isCurrent=current.assignment()!=null && current.assignment().id()==original.id();
                if(isCurrent && !op.useAsCurrent()) {
                    require(op.restoration()!=null,"Escolha explicitamente posição vazia ou equipamento anterior.");
                    require(op.restoration()==Restoration.PREVIOUS ? op.replacementId()!=null : op.replacementId()==null,
                        "A escolha de restauração não corresponde ao registro selecionado.");
                } else require(op.restoration()==null,"Esta operação não permite restaurar a posição.");
                Assignment replacement=op.replacementId()==null?null:owned(op.replacementId(),member.getId(),op.slot());
                require(replacement==null || replacement.id()!=original.id(),"Escolha outro equipamento válido.");
                require(isCurrent || replacement==null,"O registro não ocupa mais a posição atual; não escolha restauração.");
                if(op.action()==Action.CORRECT) {
                    require(!op.useAsCurrent() || replacement==null,"Escolha a correção ou um equipamento anterior.");
                    result=newAssignment(op,actor.getId(),original.id());
                    repository.status(original.id(),"CORRECTED",op.reason().trim(),actor.getId());
                    if(op.useAsCurrent()) repository.setSlot(member.getId(),op.slot(),result.id());
                    else if(isCurrent) repository.setSlot(member.getId(),op.slot(),replacement==null?null:replacement.id());
                } else {
                    require(!op.useAsCurrent(),"Cancelamento exige escolha de restauração ou posição vazia.");
                    repository.status(original.id(),"CANCELLED",op.reason().trim(),actor.getId());
                    result=repository.assignment(original.id());
                    if(isCurrent) repository.setSlot(member.getId(),op.slot(),replacement==null?null:replacement.id());
                }
            }
            default -> throw error("Operação inválida.",HttpStatus.BAD_REQUEST);
        }
        if(recipient!=null) {
            var old=transferSource;
            var received=repository.transfer(old,recipient.getId(),destination.slot(),actor.getId(),
                LocalDate.now(ZoneId.of("America/Sao_Paulo")),"Repasse de "+member.getNickname()+" · registro #"+old.id());
            repository.setSlot(recipient.getId(),destination.slot(),received.id());
            repository.status(old.id(),"TRANSFERRED","Repassado para "+recipient.getNickname()+" · registro #"+received.id(),actor.getId());
            if(op.action()==Action.TRANSFER) result=repository.assignment(old.id());
            audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,recipient,Map.of(
                "action","TRANSFER_RECEIVED","operationId",op.operationId(),"sourceMemberId",member.getId(),
                "sourceAssignmentId",old.id(),"assignmentId",received.id(),"slot",destination.slot(),
                "before",destination.assignment()==null?Map.of():destination.assignment(),"after",received));
        }
        repository.remember(op,actor.getId(),result.id());
        var payload=new LinkedHashMap<String,Object>();
        payload.put("action",op.action()); payload.put("assignmentId",result.id()); payload.put("slot",op.slot());
        payload.put("operationId",op.operationId()); payload.put("reason",op.reason());
        payload.put("before",current.assignment()); payload.put("after",repository.slot(member.getId(),op.slot()).assignment());
        payload.put("record",result);
        if(op.quantity()!=null) { payload.put("quantity",op.quantity()); payload.put("assignmentIds",createdIds); }
        if(op.transfer()!=null) payload.put("transfer",op.transfer());
        audit.log(AuditLogType.EQUIPMENT_CHANGED,actor,member,payload);
        return admin?result:result.withoutAudit();
    }
    // Modelos com mais de uma variação de efeito: a administração confirma a correta.
    private static final Effect UNVERIFIED_EFFECT=new Effect("client:unverified",null,"Efeito a confirmar","FLAT",
        BigDecimal.ZERO,"Enviado pelo jogo; a administração confirma o efeito.","");
    /**
     * Sincronização pela DLL do cliente, associada pelo nome do personagem e sem token
     * (mesma decisão do status e das quests). Mantém o quadro igual ao que está vestido no
     * jogo; cada troca vira um registro GAME_CLIENT no histórico, corrigível pelas operações
     * manuais. Só itens novos para o membro entram no log (um único CLIENT_SYNC por envio):
     * voltar para um item que ele já tinha (ex.: alternar arma de correr e de bater) ou
     * esvaziar a posição não gera log. Posições não enviadas ficam como estão.
     * Personagem compartilhado (mesmo nick em mais de uma conta): todas as contas aptas recebem o envio.
     */
    @Transactional
    public Map<String,Object> syncFromClient(ClientEquipment request) {
        var owners=members.findByGameCharacter(request.character());
        if(owners.isEmpty()) throw error("Nenhum membro com esse nome de personagem.",HttpStatus.NOT_FOUND);
        var seen=new HashSet<Slot>();
        for(var input:request.slots()) require(input.slot()!=Slot.Weapon2 && seen.add(input.slot()),"Posição repetida ou não suportada.");
        var eligible=owners.stream().map(o->members.findByIdForUpdate(o.getId()).orElseThrow())
            .filter(m->m.getStatus()==MemberStatus.APROVADO && m.isProfileComplete()).toList();
        require(!eligible.isEmpty(),"O membro deve estar aprovado e com perfil completo.");
        var today=LocalDate.now(ZoneId.of("America/Sao_Paulo"));
        var changed=new LinkedHashSet<String>();
        var unknown=new LinkedHashSet<String>();
        for(var member:eligible) syncMemberFromClient(member,request,today,changed,unknown);
        return Map.of("changed",List.copyOf(changed),"unknown",List.copyOf(unknown));
    }
    private void syncMemberFromClient(Member member,ClientEquipment request,LocalDate today,Set<String> changed,Set<String> unknown) {
        var slotsChanged=new ArrayList<String>();
        var changes=new ArrayList<Map<String,Object>>();
        for(var input:request.slots()) {
            var current=repository.slot(member.getId(),input.slot());
            var before=current.assignment();
            String code=input.code();
            if(code==null ? before==null : before!=null && code.equals(before.gameCode())) continue;
            Long target=null;
            boolean created=false;
            if(code!=null) {
                target=repository.idleAssignment(member.getId(),input.slot(),code);
                if(target==null) {
                    var item=repository.clientCatalogItem(input.slot().category,code);
                    if(item==null) { unknown.add(input.slot().name()+":"+code); continue; }
                    var effect=item.effects().size()==1?item.effects().getFirst():UNVERIFIED_EFFECT;
                    var op=new Operation(null,Action.CREATE,member.getId(),input.slot(),current.version(),null,item.id(),effect.key(),
                        Origin.GAME_CLIENT,today,true,null,null,"Sincronizado pelo cliente do jogo");
                    target=repository.create(op,item,effect,item.sourceHash(),member.getId(),null).id();
                    created=true;
                }
            }
            repository.setSlot(member.getId(),input.slot(),target);
            slotsChanged.add(input.slot().name());
            if(!created) continue;
            var change=new LinkedHashMap<String,Object>();
            change.put("slot",input.slot()); change.put("before",before);
            change.put("after",repository.slot(member.getId(),input.slot()).assignment());
            changes.add(change);
        }
        if(!changes.isEmpty()) {
            var payload=new LinkedHashMap<String,Object>();
            payload.put("action","CLIENT_SYNC"); payload.put("changes",changes);
            payload.put("slots",changes.stream().map(c->((Slot)c.get("slot")).name()).toList());
            audit.log(AuditLogType.EQUIPMENT_CHANGED,member,member,payload);
        } else if(!slotsChanged.isEmpty()) ws.publishEquipmentChanged(); // sem log, o quadro ainda precisa atualizar
        changed.addAll(slotsChanged);
    }
    @Transactional
    public Map<String,Object> importCatalog(ImportRequest request) {
        var actor=actor(true);
        repository.lockImport();
        return saveCatalog(request,actor);
    }
    @Transactional(rollbackFor=IOException.class)
    public void initializeCatalog() throws IOException {
        repository.lockImport();
        // Um catálogo já administrado nunca é substituído pela versão embutida.
        if(!repository.importStatus().isEmpty() || repository.hasCatalogMetadata()) return;
        try(var input=new GZIPInputStream(new ClassPathResource("equipment-catalog.json.gz").getInputStream())) {
            saveCatalog(json.readValue(input,ImportRequest.class),null);
        }
    }
    private Map<String,Object> saveCatalog(ImportRequest request,Member actor) {
        require(validator.validate(request).isEmpty(),"Catálogo de equipamentos inválido.");
        var keys=new HashSet<String>();
        var effects=new ArrayList<List<Effect>>();
        for(var item:request.items()) {
            require(categoryValid(item.category()) && keys.add(item.category()+":"+item.gameCode()),"Categoria inválida ou código duplicado no lote.");
            var options=new ArrayList<Effect>();
            var effectKeys=new HashSet<String>();
            for(var input:item.effects()) {
                var effect=dictionary.effect(input.code(),input.value(),item.itemType());
                if(effectKeys.add(effect.key())) options.add(effect);
            }
            if(options.isEmpty()) options.add(new Effect("none",null,"Sem efeito","FLAT",BigDecimal.ZERO,"",""));
            effects.add(options);
        }
        for(var item:request.excluded()) require(categoryValid(item.category()) && keys.add(item.category()+":"+item.gameCode()),"Exclusão repetida ou conflitante com lote.");
        repository.importItems(request,effects);
        audit.log(AuditLogType.EQUIPMENT_CATALOG_IMPORTED,actor,(Member)null,Map.of(
            "sourceHash",request.sourceHash(),"count",request.items().size(),"excluded",request.excluded().size()));
        return Map.of("imported",request.items().size(),"excluded",request.excluded().size());
    }
}
